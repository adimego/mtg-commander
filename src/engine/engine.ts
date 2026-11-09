import cardData from '../data/cards.json';
import deckData from '../data/decks.json';
import { CEFx, Color, ManaSym, COLORS, Cost, TargetSpec, Filter, TSlot, Amt, Ref, PRef, Cond, TokenSpec, Effect, ActAbility, TriggerDef, CardDef, DeckDef, Modes, ManaAbility, Static } from './types';
export * from './types';

export const CARDS: Record<string, CardDef> = Object.fromEntries((cardData as unknown as CardDef[]).map(c => [c.id, c]));
export const DECKS = deckData as DeckDef[];
export const BUILTIN_DECKS = DECKS.length;
/** Register imported card definitions (built-in ids are never overwritten). */
export function registerCards(defs: CardDef[]) { for (const d of defs) { if (!CARDS[d.id] || CARDS[d.id].id.startsWith('x-')) CARDS[d.id] = d; if (d.back && (!CARDS[d.back.id] || CARDS[d.back.id].id.startsWith('x-'))) CARDS[d.back.id] = d.back; } }
/** The overloaded version of a card (its overload cost, "target" read as "each"). */
export function overloadId(id: string): string | null { const d = CARDS[id]; if (!d?.overload?.spell) return null; const nid = `${id}#ov`; if (!CARDS[nid]) CARDS[nid] = { ...d, id: nid, cost: d.overload.cost, spell: d.overload.spell, overload: undefined }; return nid; }
/** A copy of a card's def that isn't legendary ("except it isn't legendary"). */
export function nonLegendId(id: string): string { return copyModId(id, { nl: true }); }
/** Token copy with modifications (not legendary, extra keywords). */
export function copyModId(id: string, o: { nl?: boolean; kw?: string[] } = {}): string {
  const d = CARDS[id]; if (!d) return id; if (o.nl && !d.legendary && !o.kw?.length) return id;
  const nid = `${id}#c${o.nl ? 'n' : ''}${(o.kw ?? []).join('.')}`;
  if (!CARDS[nid]) CARDS[nid] = { ...d, id: nid, legendary: o.nl ? false : d.legendary, keywords: [...new Set([...(d.keywords ?? []), ...(o.kw ?? [])])], typeLine: `${o.nl ? '' : d.legendary ? 'Legendary ' : ''}${d.typeLine?.replace(/^Legendary /, '') ?? d.types.join(' ')}` };
  return nid;
}
/** Turn a double-faced card over (back face up, or front face up again). */
export function flipFace(c: Card): boolean { if (c.face) { c.id = c.face; delete c.face; offBfEff(c); return true; } const b = CARDS[c.id]?.back; if (!b) return false; CARDS[b.id] ??= b; c.face = c.id; c.id = b.id; offBfEff(c); return true; }
export function frontFace(c: Card) { if (c.face) flipFace(c); }
const frontDef = (c: Card) => CARDS[c.face ?? c.id];
/** Add or replace an imported deck in the deck registry. */
export function registerDeck(d: DeckDef) { const i = DECKS.findIndex(x => x.id === d.id); if (i >= BUILTIN_DECKS) DECKS[i] = d; else if (i < 0) DECKS.push(d); }
export function unregisterDeck(id: string) { const i = DECKS.findIndex(x => x.id === id); if (i >= BUILTIN_DECKS) DECKS.splice(i, 1); }

export interface Card {
  /** may be played from exile by this player (cross-owner) */ playBy?: number; /** play it without paying its mana cost */ playFree?: boolean; /** mana of any type can be spent to cast it */ anyMana?: boolean; /** exile it instead of putting it into a graveyard after it resolves */ exileAfter?: boolean; /** creatures that convoked it */ convokedBy?: number[]; /** can't be sacrificed through this turn */ noSacT?: number;
  /** Archnemesis: the player this Aura enchants */ encP?: number; /** counters it had when it last left the battlefield */ lastCtrs?: Record<string, number>; /** Captain America, Living Legend: turn it was untapped / was already tapped */ capT?: number; preTapT?: number; /** Folk Hero: turn its granted ability triggered */ folkT?: number;
  /** suspended in exile (time counters in counters.time) */ suspended?: boolean; /** cast via suspend: gains haste when it enters */ susHaste?: boolean; /** exiled with this source uid (Negative Zone Portal) */ exBy?: number;
  /** a copy of a spell (ceases to exist when it leaves the stack) */ isCopy?: boolean; /** Cosmic Crucible: turn it last copied */ copyT?: number;
  /** extra counters to put on as it enters (Spark Double) */ enterCtr?: { kind: string; n: number };
  /** copy effects: original card id, and 'until end of turn' marker */ origId?: string; copyEot?: number;
  /** 'choose one that hasn't been chosen' (Kimoyo Beads) */ chosenModes?: number[];
  /** vow counter: can't attack this player */ vowVs?: number; /** must attack this player each combat until turn t */ mustAtk?: { pid: number; t: number };
  /** source uid -> turn it last dealt damage to this */ dmgBy?: Record<number, number>; /** turn this was last dealt damage */ dmgT?: number;
  evoked?: boolean; discarded?: number; webSlung?: boolean; earthbent?: boolean;
  /** entered from a resolving spell ("if you cast it") */ wasCast?: boolean; /** front-face id while the back face is up */ face?: string; /** on an adventure (exile) */ onAdv?: boolean; /** exiled by rebound on this turn */ reboundT?: number; /** turn it was foretold */ foretold?: number;
  /** 'As this enters, choose a creature type' */ chosenType?: string;
  /** Soulbond: uid of the paired creature. */ pair?: number;
  /** Champion: uid of the exiled card. */ champ?: number;
  /** Doesn't untap during this player's next untap step. */ freeze?: number;
  /** A flood counter on this land makes it an Island (Aquitect's Will, Eluge). */ floodIsle?: boolean;
  /** Loses all abilities while this permanent's uid is on the battlefield (Tishana's Tidebinder). */ loseSrc?: number;
  uid: number; id: string; owner: number; tapped: boolean; sick: boolean; damage: number; pp: number; pt: number; deathtouched?: boolean; attacking?: number; blockedBy?: number[]; blocking?: number;
  token?: boolean; counters?: Record<string, number>; kw?: string[]; attachedTo?: number; regen?: number; goad?: { by: number; turn: number };
  /** static-ability layer results (recomputed by layer()) */ sp?: number; st?: number; skw?: string[]; monstrous?: boolean; /** unearthed: exiled instead if it would leave the battlefield */ unearthed?: boolean; /** keywords granted with no duration */ pkw?: string[]; manaN?: number; /** extra mana when tapped for mana (Nissa) */ manaX?: ManaSym[];
  usedLoyalty?: number; /** owner when controlled by someone else */ realOwner?: number; /** attacking this planeswalker uid */ atkPw?: number;
  /** 'becomes a creature' until end of turn */ anim?: { p: number; t: number; kw?: string[]; prevent?: boolean; ts?: number; perm?: boolean }; /** layered characteristics (layer()); def() returns this */ eff?: CardDef; /** timestamp (entered the battlefield / emblem created) */ ts?: number; faceDown?: boolean; /** prepare mechanic: this creature is prepared */ prepared?: boolean; /** a castable copy of the prepare spell of this permanent (lives in the command zone) */ prepFor?: number; /** warped: castable from exile after this turn */ warpAfter?: number; /** Class level (starts at 1) */ classLvl?: number; /** cast using teamwork */ teamwork?: boolean; /** sneak: attack to inherit on entering; set once the sneak cost was paid */ sneakAtk?: { attacking: number; atkPw?: number }; sneakPaid?: boolean; /** turn this mount became saddled */ saddled?: number; /** this spell was cast for its warp cost */ warpCast?: boolean; /** Ugin: exiled card returned when this token leaves */ linkRet?: number; /** effects lasting until a player's next turn */ nx?: { by: number; p: number; t: number; kw: string[] }; kicked?: boolean; /** loyalty lost to compleated (phyrexian life) */ compleat?: number; /** subtypes / colors added by effects */ addSub?: string[]; addColors?: Color[]; /** turn it entered the battlefield */ enteredTurn?: number; x?: number; mayPlay?: number; /** may cast it from exile without paying its mana cost this turn */ mayFree?: number; flicker?: number; lki?: { p: number; t: number };
}
export interface Player {
  /** Progenitor's Icon: next spell of this type this turn has flash */ flashT?: { type: string; turn: number }; /** Conduit of Worlds: can't cast more spells on this turn */ noCastT?: number; /** Lady Loki: first I/S/Villain spell handled */ ladyT?: number;
  /** cards discarded on turn discT */ discN?: number;
  /** permanents phased out until this player's next turn */ phased?: Card[];
  /** Photon: mana tagged @keep stays until end of this turn */ keepT?: number; /** Willie Lumpkin: can't attack this player during turn <= t */ noAtkVs?: { pid: number; t: number }[];
  /** players attacked during this player's most recent turn */ atkDefs?: { turn: number; defs: number[] }; /** colors of spells cast this turn */ spellCols?: { turn: number; cols: string[] }; /** turn of last discard */ discT?: number;
  id: number; /** colors opponents' lands could produce / among your legendary permanents (kept by layer()) */ oppCols?: string[]; legCols?: string[]; name: string; human: boolean; life: number; deckName: string; commanderId: string; commanderCasts: number; commanderIds: string[]; casts: Record<string, number>; identity: Color[];
  library: Card[]; hand: Card[]; battlefield: Card[]; graveyard: Card[]; exile: Card[]; command: Card[]; cmdDamage: Record<string, number>; lost: boolean; landPlayed: boolean; mulligans: number; drewEmpty?: boolean;
  /** spells cast this turn (all / noncreature / instant-sorcery-or-villain / instant-or-sorcery) */ spells?: { turn: number; n: number; nonc: number; isv: number; ins: number };
  /** poison counters */ poison?: number; /** turn a permanent you controlled last left the battlefield */ leftTurn?: number; /** Storied: enduring story */ enduring?: boolean; /** Start your engines! speed (1-4) */ speed?: number; speedTurn?: number; /** firebending {R} that lasts until end of combat */ fireMana?: number; /** floating mana; each unit is a symbol like 'G', 'C', 'W|U' or 'ANY' */ pool: string[]; gained: number; lostLife: number; emblems?: Card[]; extraTurns?: number; extraLands?: number; landsPlayed?: number;
  /** cards drawn this turn ({turn, n}) */ drawn?: { turn: number; n: number }; /** may cast sorceries at instant speed until their next turn */ flashSorc?: boolean; /** turn on which their creature spells can't be countered */ uncCreatures?: number; /** token creation doubled until end of this turn */ tokDouble?: number;
}
export interface Target { player?: number; card?: number; stack?: number }
export interface GameEvent { /** controller of the resolving effect that caused it */ by?: number; /** nth spell this turn by kind (cast events) */ nth?: { n: number; nonc: number; isv: number }; /** mana spent to cast the spell */ spent?: number; player?: number; mv?: number; amount?: number; kind?: string; from?: string; /** defending player for "attack a player" batches */ vs?: number }
export interface StackItem {
  /** permanent spell with asEnters: resolving through its replacement steps */ aeDone?: boolean;
  id: number; kind: 'spell' | 'ability' | 'trigger'; controller: number; sourceId: string; sourceUid: number; card?: Card; effects: Effect[]; targetSpec?: TargetSpec; target?: Target; label: string; event?: GameEvent; uncounterable?: boolean;
  /** where a resolved spell goes instead of the graveyard */ awayTo?: 'bottom' | 'exile';
  targets?: (Target | undefined)[]; tslots?: TSlot[]; modes?: number[]; modeDef?: Modes; x?: number; kicked?: boolean; teamwork?: boolean; flashback?: boolean; rebound?: boolean; evCard?: Card; ifc?: Cond; srcLki?: { p: number; t: number }; chapter?: boolean; /** links a trigger to the ability Aboleth Spawn may copy */ inst?: number;
}
export interface Pending { /** 'one or more' batch key */ bk?: string; controller: number; sourceId: string; sourceUid: number; trig: TriggerDef; event?: GameEvent; evCard?: Card; srcLki?: { p: number; t: number }; inst?: number }
export type Decision = { key: string; pid: number; text: string; src?: string } & (
  | { kind: 'may' }
  | { kind: 'pick'; cards: Card[]; min: number; max: number; zone: string }
  | { kind: 'scry'; cards: Card[]; mode: 'scry' | 'surveil' }
  | { kind: 'order'; items: Pending[] }
  | { kind: 'orderTop'; cards: Card[]; shuffle?: boolean }
  | { kind: 'color'; options: string[] }
  | { kind: 'ctype'; options: string[]; mode?: 'mine' | 'keep' }
  | { kind: 'player'; players: number[] }
  | { kind: 'cast'; uid: number; free?: boolean });
export interface ResCtx { item: StackItem; i: number; ans: Record<string, unknown>; chosen: Card[]; created: Card[]; done?: boolean; mana?: boolean }
export const STEPS = ['untap', 'upkeep', 'draw', 'main1', 'beginCombat', 'attackers', 'blockers', 'firstStrike', 'damage', 'main2', 'end', 'cleanup'] as const;
export type Step = typeof STEPS[number];
export interface Watch { uid: number; ev: string; controller: number; sourceId: string; sourceUid: number; label: string; effects: Effect[]; until: 'eot' | 'yourNext' | 'combat'; by: number }
export interface Game { /** Galvanic Iteration: copy the next instant/sorcery this player casts this turn */ nextIS?: { pid: number; turn: number; sourceId: string; sourceUid: number }[];
  /** Palace Jailer: exiled until an opponent of 'by' becomes the monarch */ jail?: { uid: number; by: number }[]; /** event batch id (one per effect) */ batch?: number;
  /** Heroic Sacrifice: damage to pid and their creatures goes to uid this turn */ redirect?: { pid: number; uid: number; turn: number };
  /** creature-linked delayed triggers ('whenever any of those creatures deals combat damage …') */ watch?: Watch[];
  /** additional combat phases pending after this main phase (Seize the Day) */ extraCombats?: number; combatAfter?: boolean;
  players: Player[]; active: number; step: Step; turn: number; log: string[]; seed: number; nextUid: number; winner: number | null; started: boolean;
  stack: StackItem[]; priority: number | null; passes: number; awaiting: 'attack' | 'block' | null; blockersDone: number[];
  pending: Pending[]; choice: (Pending & { needModes?: boolean }) | null; res: ResCtx | null; decision: Decision | null; died: number; ordered?: boolean; steals?: { uid: number; back: number; t?: number }[];
  /** continuous effects from resolved spells/abilities */ ces?: CE[]; tsN?: number; /** a card being cast mid-resolution ('you may cast that card') */ castNow?: { pid: number; uid: number; free?: boolean };
  /** player id of the monarch */ monarch?: number;
  /** delayed triggers */ delayed?: Delayed[]; /** turn a nonland permanent last left the battlefield / a spell was last warped (void) */ leftNL?: number; warpTurn?: number;
  /** High Tide: Islands add an extra {U} during this turn. */ highTide?: number; /** trigger-instance ids for copying abilities */ instN?: number;
}

// ---------------- helpers ----------------
export const def = (c: { id: string; eff?: CardDef }) => c.eff ?? CARDS[c.id];
export interface CE extends CEFx { ts: number; uid: number; until: 'eot' | 'yourNext' | 'perm'; by: number; chosen?: boolean }
export interface Delayed { at: 'endStep' | 'upkeep'; pid?: number; turnAfter: number; controller: number; sourceId: string; sourceUid: number; label: string; effects: Effect[]; evCard?: Card }
export const nextTs = (g: Game) => (g.tsN = (g.tsN ?? 0) + 1);
const SUBS = new Map<string, string[]>();
const TYPE_WORDS = ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker', 'Instant', 'Sorcery', 'Battle', 'Permanent', 'Legendary', 'Basic', 'Historic', 'Outlaw', 'Equipment', 'Aura', 'Vehicle', 'Treasure', 'Food', 'Clue', 'Saga'];
const LAND_TYPES = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Desert', 'Gate', 'Cave', 'Town', 'Sphere', 'Locus', 'Lair', 'Mine', 'Tower', 'Urza\'s', 'Power-Plant'];
export function subtypes(d: CardDef): string[] {
  if (d.sub) return d.sub; let s = SUBS.get(d.id); if (s) return s;
  s = (d.typeLine ?? '').split('//')[0].split('—')[1]?.trim().split(/\s+/).filter(Boolean) ?? []; SUBS.set(d.id, s); return s;
}
export const isType = (c: { id: string } & Partial<Card>, t: string) => def(c).types.includes(t);
const isTypeOrSub = (d: CardDef, t: string) => d.types.includes(t) || subtypes(d).includes(t) || (!!d.keywords?.includes('changeling') && d.types.includes('Creature') && !TYPE_WORDS.includes(t) && /^[A-Z]/.test(t) && !LAND_TYPES.includes(t)) || (t === 'Legendary' && !!d.legendary) || (t === 'Basic' && !!d.basic) || (t === 'Permanent' && isPermanentCard(d)) || (t === 'Historic' && (!!d.legendary || d.types.includes('Artifact') || subtypes(d).includes('Saga'))) || (t === 'Outlaw' && ['Assassin', 'Mercenary', 'Pirate', 'Rogue', 'Warlock'].some(x => subtypes(d).includes(x)));
export const hasKw = (c: { id: string } & Partial<Card>, k: string) => !!def(c).keywords?.includes(k) || !!c.kw?.includes(k) || !!c.skw?.includes(k) || !!c.pkw?.includes(k) || !!c.nx?.kw.includes(k) || (c.counters?.[k] ?? 0) > 0;
export const emblemsOf = (p: Player) => p.emblems ?? [];
/** permanents plus emblems: everything whose static/triggered abilities are live */
export const liveSources = (g: Game) => g.players.flatMap(p => [...p.battlefield, ...emblemsOf(p)]);
/** Does a live source controlled by one of `pids` have the player-level static `k`? */
export const hasPStatic = (g: Game, pids: number[], k: Static['k'], test?: (st: Static, src: Card) => boolean) => liveSources(g).some(c => pids.includes(ctl(c)) && !!def(c).statics?.some(st => st.k === k && (!test || test(st, c)) && (!st.cond || condOk(g, ctl(c), st.cond, c))));
const oppIds = (g: Game, pid: number) => g.players.filter(q => q.id !== pid && !q.lost).map(q => q.id);
export const canBeCommander = (d: CardDef | undefined) => !!d && ((!!d.legendary && (d.types.includes('Creature') || !!d.offBf?.addTypes?.includes('Creature'))) || !!d.canBeCommander);
export const cmc = (d: CardDef) => d.cost.generic + COLORS.reduce((s, k) => s + (d.cost[k] || 0), 0) + (d.cost.C || 0) + (d.cost.hyb?.reduce((s, h) => s + (h.startsWith('2|') ? 2 : 1), 0) ?? 0) + (d.cost.phy?.length ?? 0);
/** commander-damage key: each commander is tracked separately (903.10a) */
export const cmdKey = (g: Game, c: Card) => { const i = g.players[c.owner].commanderIds.indexOf(c.id); return i <= 0 ? `${c.owner}` : i === 1 ? `${c.owner}p` : `${c.owner}p${i}`; };
export const isCommander = (g: Game, c: Card) => !c.token && g.players[c.owner].commanderIds.includes(c.id);
export const isPermanentCard = (d: CardDef) => !d.types.includes('Instant') && !d.types.includes('Sorcery');
export const log = (g: Game, m: string) => { g.log.push(`T${g.turn} ${m}`); if (g.log.length > 400) g.log.shift(); };
const nm = (c: { id: string }) => def(c).name;
function rand(g: Game) { g.seed = (g.seed + 0x6d2b79f5) | 0; let t = g.seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
export function shuffle<T>(g: Game, a: T[]) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(g) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }
export const alive = (g: Game) => g.players.filter(p => !p.lost);
export const opponents = (g: Game, pid: number) => g.players.filter(p => !p.lost && p.id !== pid);
export function nextAlive(g: Game, pid: number) { for (let i = 1; i <= g.players.length; i++) { const q = (pid + i) % g.players.length; if (!g.players[q].lost) return q; } return pid; }
const firstAliveFrom = (g: Game, pid: number) => (g.players[pid].lost ? nextAlive(g, pid) : pid);
export const isEmblem = (c: { id: string }) => c.id.startsWith('emblem:');
export function findCard(g: Game, uid: number): Card | undefined { for (const p of g.players) { const c = p.battlefield.find(x => x.uid === uid); if (c) return c; } }
type Zone = 'battlefield' | 'hand' | 'library' | 'graveyard' | 'exile' | 'command';
const ZONES: Zone[] = ['battlefield', 'hand', 'graveyard', 'exile', 'library', 'command'];
/** Find a card in any zone. */
export function locate(g: Game, uid: number): { c: Card; zone: Zone; p: Player } | undefined {
  for (const p of g.players) for (const z of ZONES) { const c = p[z].find(x => x.uid === uid); if (c) return { c, zone: z, p }; }
}
export const creatures = (p: Player) => p.battlefield.filter(c => isType(c, 'Creature'));
export const ctr = (c: Card, k: string) => c.counters?.[k] ?? 0;

export function colorIdentity(d: CardDef): Color[] { if (d.identity) return d.identity; return COLORS.filter(k => d.colors.includes(k) || (d.cost[k] || 0) > 0 || new RegExp(`\\{${k}\\}`).test(d.text)); }
export function validateDeck(d: DeckDef): string[] {
  const errs: string[] = []; const cmd = CARDS[d.commander];
  if (!canBeCommander(cmd)) errs.push('commander must be a legendary creature (or say it can be your commander)');
  const total = d.cards.length + 1 + (d.partner ? 1 : 0) + (d.extra?.length ?? 0);
  if (total !== 100) errs.push(`deck has ${total} cards, needs 100`);
  const ident = [...new Set([...(cmd ? colorIdentity(cmd) : []), ...[d.partner, ...(d.extra ?? [])].filter(Boolean).flatMap(x => colorIdentity(CARDS[x!]))])]; const seen = new Set<string>();
  for (const id of d.cards) {
    const c = CARDS[id]; if (!c) { errs.push(`unknown card ${id}`); continue; }
    if (!c.basic) { if (seen.has(id) || id === d.commander) errs.push(`duplicate ${c.name}`); seen.add(id); }
    if (colorIdentity(c).some(k => !ident.includes(k))) errs.push(`${c.name} outside color identity`);
  }
  return errs;
}

// ---------------- AI hooks (set by ai.ts) ----------------
export interface AIHooks {
  targets: (g: Game, pid: number, slots: TSlot[], effects: Effect[], mandatory: boolean, srcUid?: number) => (Target | undefined)[] | null;
  decide: (g: Game, d: Decision) => unknown;
  modes: (g: Game, pid: number, m: Modes, srcUid?: number) => number[];
  /** cast this card right now (mid-resolution); return whether it was cast */ castNow?: (g: Game, pid: number, c: Card) => boolean;
}
export let AI: AIHooks = { targets: () => null, decide: d => (d as unknown as Decision).kind === 'may' ? true : [], modes: (_g, _p, m) => Array.from({ length: m.min }, (_, i) => i) };
export function setAI(h: Partial<AIHooks>) { AI = { ...AI, ...h }; }
/** Legacy single-target hook (kept for older callers). */
export let autoTarget: (g: Game, pid: number, spec: TargetSpec, effects: Effect[], mandatory: boolean) => Target | undefined = () => undefined;
export function setAutoTarget(f: typeof autoTarget) { autoTarget = f; }

// ---------------- setup ----------------
function inst(g: Game, id: string, owner: number): Card { const c: Card = { uid: g.nextUid++, id, owner, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 }; offBfEff(c); return c; }
export interface NewGameOpts { seed?: number; decks?: string[]; names?: string[]; humans?: number[]; skipAiMulligan?: boolean; /** commander id chosen for each seat. Blank seats use the deck's primary face commander. */ commanders?: (string | undefined)[] }
/** Face commanders a deck offers. `extra` lists alternatives to `commander` (pick one). A legal partner is separate and is not an alternative. */
export function faceCommanders(d: DeckDef): string[] {
  const ids = [d.commander, ...(d.extra ?? [])];
  return ids.filter((id, i) => !!id && ids.indexOf(id) === i);
}
/** One commander for the command zone, plus a partner when the deck has one. Every other face commander is a normal library card. */
export function resolveCommanders(d: DeckDef, pick?: string): { commanders: string[]; library: string[] } {
  const faces = faceCommanders(d);
  const chosen = pick && faces.includes(pick) ? pick : faces[0];
  const commanders = [chosen];
  if (d.partner && !commanders.includes(d.partner)) commanders.push(d.partner);
  return { commanders, library: faces.filter(id => !commanders.includes(id)) };
}
export function newGame(o: NewGameOpts = {}): Game {
  const g: Game = { players: [], active: 0, step: 'untap', turn: 0, log: [], seed: o.seed ?? (Date.now() | 0), nextUid: 1, winner: null, started: false, stack: [], priority: null, passes: 0, awaiting: null, blockersDone: [], pending: [], choice: null, res: null, decision: null, died: 0 };
  const deckIds = o.decks ?? DECKS.map(d => d.id); const humans = o.humans ?? [0];
  deckIds.forEach((did, i) => {
    const d = DECKS.find(x => x.id === did)!;
    const { commanders: cids, library: extraLib } = resolveCommanders(d, o.commanders?.[i]);
    const ident = [...new Set(cids.flatMap(x => colorIdentity(CARDS[x])))];
    const p: Player = { id: i, name: o.names?.[i] ?? (humans.includes(i) ? 'You' : `AI ${i}`), human: humans.includes(i), life: 40, deckName: d.name, commanderId: cids[0], commanderCasts: 0, commanderIds: cids, casts: {}, identity: COLORS.filter(k => ident.includes(k)), library: [...d.cards, ...extraLib].map(id => inst(g, id, i)), hand: [], battlefield: [], graveyard: [], exile: [], command: cids.map(x => inst(g, x, i)), cmdDamage: {}, lost: false, landPlayed: false, mulligans: 0, pool: [], gained: 0, lostLife: 0 };
    g.players.push(p); shuffle(g, p.library); draw(g, i, 7);
    if (extraLib.length) { const names = extraLib.map(id => CARDS[id].name); log(g, `${p.name} ${p.name === 'You' ? 'choose' : 'chooses'} ${CARDS[cids[0]].name} as commander. ${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} shuffled into the library.`); }
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
export function draw(g: Game, pid: number, n: number) {
  const p = g.players[pid];
  for (let i = 0; i < n; i++) {
    if (p.drawn?.turn !== g.turn) p.drawn = { turn: g.turn, n: 0 };
    if (p.drawn.n >= 1 && g.started && hasPStatic(g, oppIds(g, pid), 'drawLimit')) { log(g, `${p.name} can't draw more than one card this turn.`); break; }
    const c = p.library.pop(); if (!c) { if (g.started && hasPStatic(g, [pid], 'winOnEmptyDraw')) { winGame(g, pid); break; } p.drewEmpty = true; break; } p.drawn.n++; p.hand.push(c); if (g.started) emit(g, 'drawCard', { player: pid, amount: p.drawn.n });
    if (g.started && p.drawn.n === 1 && !isType(c, 'Land') && p.battlefield.some(q => def(q).miracle0)) { const mm = p.battlefield.find(q => def(q).miracle0)!; g.pending.push({ controller: pid, sourceId: mm.id, sourceUid: mm.uid, trig: { on: 'x', label: `Miracle — you may cast ${nm(c)} for {0}`, effects: [{ op: 'script', kind: 'miracle', n: c.uid } as Effect] }, event: { player: pid } }); } }
}

// ---------------- turn structure & priority ----------------
function beginTurn(g: Game, pid: number) {
  { const p0 = g.players[pid]; if (p0.phased?.length) { for (const c of p0.phased) { p0.battlefield.push(c); log(g, `${nm(c)} phases in.`); } p0.phased = []; } }
  g.players[pid].atkDefs = { turn: g.turn + 1, defs: [] }; g.active = pid; g.turn++; delete g.players[pid].flashSorc; g.blockersDone = []; g.died = 0;
  for (const q of g.players) for (const c of q.battlefield) if (c.nx?.by === pid) delete c.nx;
  if (g.ces) g.ces = g.ces.filter(x => !(x.until === 'yourNext' && x.by === pid));
  if (g.watch) g.watch = g.watch.filter(w => !(w.until === 'yourNext' && w.by === pid));
  for (const c of g.players[pid].battlefield) if (c.tapped) c.preTapT = g.turn + 1;
  const p = g.players[pid]; p.landPlayed = false; p.landsPlayed = 0;
  for (const q of g.players) { q.gained = 0; q.lostLife = 0; }
  for (const c of p.battlefield) { const frozen = c.freeze === pid; if (frozen) delete c.freeze; if (!frozen && !hasKw(c, '_doesntuntap')) c.tapped = false; c.sick = false; if (c.goad && c.goad.turn < g.turn && c.goad.by === pid) delete c.goad; }
  for (const q of g.players) if (q.id !== pid) for (const c of q.battlefield) if (c.freeze === pid) delete c.freeze;
  for (const q of g.players) for (const c of q.battlefield) if (c.goad && c.goad.by === pid) delete c.goad;
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
  for (const p of g.players) {
    // firebending mana lasts until end of combat
    const keep = ['blockers', 'firstStrike', 'damage'].includes(s) ? Math.min(p.fireMana ?? 0, p.pool.filter(u => u === 'R').length) : 0;
    const kept = p.keepT === g.turn ? p.pool.filter(u => u.endsWith('@keep')) : [];
    p.pool = Array(keep).fill('R'); if (keep) p.fireMana = keep; else delete p.fireMana; p.pool.push(...kept);
  }
  switch (s) {
    case 'untap': return enterStep(g, 'upkeep');
    case 'upkeep': suspendTick(g); fireDelayed(g, 'upkeep'); emit(g, 'upkeep', { player: g.active }); break;
    case 'draw': if (g.turn > 1 || g.players.length > 2) draw(g, g.active, 1); emit(g, 'drawStep', { player: g.active }); checkState(g); break;
    case 'main1': for (const c of [...act.battlefield]) if (def(c).saga) addCounters(g, c, 'lore', 1); emit(g, 'firstMain', { player: g.active }); break;
    case 'beginCombat': if (!creatures(act).some(c => canAttack(g, c, true))) return enterStep(g, 'main2'); emit(g, 'beginCombat', { player: g.active }); if (!g.pending.length) return enterStep(g, 'attackers'); break;
    case 'attackers':
      if (!creatures(act).some(c => canAttack(g, c, true))) return enterStep(g, 'main2');
      g.awaiting = 'attack'; return;
    case 'blockers': if (!attackers(g).length) return enterStep(g, 'main2'); g.blockersDone = []; g.awaiting = 'block'; maybeFinishBlocks(g); return;
    case 'firstStrike': if (!combatants(g).some(strikesFirst)) return enterStep(g, 'damage'); dealCombat(g, true); break;
    case 'damage': dealCombat(g, false, combatants(g).some(strikesFirst)); break;
    case 'main2': clearCombat(g); break;
    case 'end': fireDelayed(g, 'endStep'); emit(g, 'endStep', { player: g.active }); if (g.monarch === g.active) monarchTrig(g, g.active, 'the monarch draws a card', [{ op: 'draw', n: 1, pl: 'you' }]); break;
    case 'cleanup': cleanup(g); delete g.extraCombats; delete g.combatAfter; return beginTurn(g, nextTurn(g));
  }
  if (g.winner === null) givePriority(g);
}
function nextTurn(g: Game) { const p = g.players[g.active]; if (!p.lost && p.extraTurns) { p.extraTurns--; log(g, `${p.name} takes an extra turn.`); return g.active; } return nextAlive(g, g.active); }
function advanceStep(g: Game) {
  if (g.players[g.active].lost) { cleanup(g); return beginTurn(g, nextTurn(g)); }
  if ((g.step === 'main1' || g.step === 'main2') && g.extraCombats) { g.extraCombats--; if (g.step === 'main1') g.combatAfter = true; log(g, 'Additional combat phase.'); return enterStep(g, 'beginCombat'); }
  if (g.step === 'main2' && g.combatAfter) { delete g.combatAfter; return enterStep(g, 'beginCombat'); }
  enterStep(g, STEPS[STEPS.indexOf(g.step) + 1]);
}
/** Player passes priority. When all living players pass in a row: resolve top of stack, or move to the next step. */
export function pass(g: Game, pid: number) {
  if (g.priority !== pid || g.winner !== null || g.choice || g.decision || g.res) return false;
  g.passes++;
  if (g.passes >= alive(g).length) {
    g.passes = 0;
    if (g.stack.length) { if (resolveTop(g) && g.winner === null) givePriority(g); }
    else advanceStep(g);
  } else g.priority = nextAlive(g, pid);
  return true;
}
function acted(g: Game) { g.passes = 0; checkState(g); flushTriggers(g); }
function clearCombat(g: Game) { if (g.watch) g.watch = g.watch.filter(w => w.until !== 'combat'); for (const p of g.players) for (const c of p.battlefield) { delete c.attacking; delete c.blockedBy; delete c.blocking; delete c.atkPw; } }
function cleanup(g: Game) {
  clearCombat(g);
  for (const p of g.players) for (const c of p.battlefield) if (c.copyEot !== undefined && c.origId) { log(g, `${nm(c)} is no longer a copy.`); c.id = c.origId; delete c.origId; delete c.copyEot; }
  for (const p of g.players) for (const c of p.battlefield) { c.damage = 0; c.pp = 0; c.pt = 0; c.deathtouched = false; c.kw = undefined; c.regen = 0; if (!c.anim?.perm) delete c.anim; }
  if (g.ces) g.ces = g.ces.filter(x => x.until !== 'eot');
  if (g.watch) g.watch = g.watch.filter(w => w.until !== 'eot');
  // 'gain control ... until end of turn' ends
  for (const st of g.steals ?? []) { if (st.t !== undefined && st.t > g.turn) continue; const c = findCard(g, st.uid); if (c && c.owner !== st.back) changeControl(g, c, st.back); }
  g.steals = (g.steals ?? []).filter(st => st.t !== undefined && st.t > g.turn);
  for (const p of g.players) for (const z of ['exile', 'graveyard', 'hand', 'library'] as const) for (const c of p[z]) if (c.mayPlay && c.mayPlay <= g.turn) delete c.mayPlay;
  // delayed "return at end of turn" flickers
  for (const p of g.players) for (const c of [...p.exile]) if (c.flicker === g.turn) { delete c.flicker; p.exile = p.exile.filter(x => x !== c); enter(g, c, c.owner, {}); }
  const p = g.players[g.active];
  const max = p.battlefield.some(c => def(c).statics?.some(s => s.k === 'noMaxHand')) ? 99 : 7;
  while (p.hand.length > max) { const c = [...p.hand].sort((a, b) => cmc(def(b)) - cmc(def(a)))[0]; p.hand = p.hand.filter(x => x !== c); p.graveyard.push(c); log(g, `${p.name} discards ${nm(c)}.`); }
  layer(g);
}

// ---------------- characteristics & static abilities ----------------
/** Controller of a permanent (control-changing effects are not modelled: always the owner). */
export const ctl = (c: Card) => c.owner;
/** Source whose chosen creature type 'of the chosen type' filters use when no source uid is passed. */
let CT_SRC: Card | undefined;
const findAny = (g: Game, uid: number) => findCard(g, uid) ?? g.stack.find(x => x.card?.uid === uid)?.card ?? (g.res?.item.card?.uid === uid ? g.res.item.card : undefined);
export function matches(g: Game, c: Card, f: Filter | undefined, pid: number, srcUid?: number): boolean {
  if (!f) return true; const d = def(c); if (!d) return false;
  const ist = (t: string) => isTypeOrSub(d, t); const dcol = d.colors;
  if (f.types && !f.types.every(ist)) return false;
  if (f.anyType && !f.anyType.some(ist)) return false;
  if (f.notTypes && f.notTypes.some(ist)) return false;
  if (f.colored && !dcol.length) return false;
  if (f.ctr && !(c.counters?.[f.ctr] ?? 0)) return false;
  if (f.chosenType || f.notChosenType) { const s = (srcUid !== undefined && srcUid >= 0 ? findAny(g, srcUid) : undefined) ?? CT_SRC; const ty = s?.chosenType; if (f.chosenType && (!ty || !ist(ty))) return false; if (f.notChosenType && ty && ist(ty)) return false; }
  if (f.ctrl === 'you' && ctl(c) !== pid) return false;
  if (f.ctrl === 'opp' && ctl(c) === pid) return false;
  if (f.colors && !f.colors.some(k => dcol.includes(k))) return false;
  if (f.notColors && f.notColors.some(k => dcol.includes(k))) return false;
  if (f.colorless && dcol.length) return false;
  if (f.multicolor && dcol.length < 2) return false;
  if (f.tapped && !c.tapped) return false;
  if (f.untapped && c.tapped) return false;
  if (f.other && c.uid === srcUid) return false;
  if (f.defP) { const s0 = srcUid !== undefined ? findCard(g, srcUid) : undefined; const s = s0 && s0.attacking === undefined && s0.attachedTo !== undefined ? findCard(g, s0.attachedTo) : s0; if (!s || s.attacking === undefined || ctl(c) !== s.attacking) return false; }
  if (f.token && !c.token) return false;
  if (f.nontoken && c.token) return false;
  const onBf = !!findCard(g, c.uid);
  const pw = onBf ? power(g, c) : d.power ?? 0;
  if (f.powLE !== undefined && pw > f.powLE) return false;
  if (f.powGE !== undefined && pw < f.powGE) return false;
  if (f.cmdr && (!isCommander(g, c) || (f.cmdr === 'own' && c.owner !== pid))) return false;
  if (f.touGE !== undefined || f.touLE !== undefined) { const tu = onBf ? toughness(g, c) : d.toughness ?? 0; if (f.touGE !== undefined && tu < f.touGE) return false; if (f.touLE !== undefined && tu > f.touLE) return false; }
  if (f.mvLE !== undefined && cmc(d) > f.mvLE) return false;
  if (f.mvGE !== undefined && cmc(d) < f.mvGE) return false;
  if (f.attacking && c.attacking === undefined) return false;
  if (f.blocking && c.blocking === undefined) return false;
  if (f.atkOrBlk && c.attacking === undefined && c.blocking === undefined) return false;
  if (f.legendary && !d.legendary) return false;
  if (f.nonlegendary && d.legendary) return false;
  if (f.basic && !d.basic) return false;
  if (f.nonbasic && d.basic) return false;
  if (f.pip && colorPips(d, f.pip) < 1) return false;
  if (f.kw && !hasKw(c, f.kw)) return false;
  if (f.noKw && hasKw(c, f.noKw)) return false;
  if (f.name && d.name !== f.name) return false;
  if (f.notName && d.name === f.notName) return false;
  if (f.goaded && !c.goad) return false;
  if (f.mvLEPow) { const s = srcUid !== undefined ? findAny(g, srcUid) : undefined; if (!s || cmc(d) > power(g, s)) return false; }
  if (f.modified && !(Object.values(c.counters ?? {}).some(v => v > 0) || g.players.some(q => q.battlefield.some(x => x.attachedTo === c.uid && (subtypes(def(x)).includes('Equipment') || (subtypes(def(x)).includes('Aura') && ctl(x) === ctl(c))))))) return false;
  return true;
}
function staticApplies(g: Game, s: { who: string; f?: Filter; cond?: Cond }, src: Card, c: Card): boolean {
  if (s.cond && !condOk(g, ctl(src), s.cond, src)) return false;
  switch (s.who) {
    case 'self': return c === src;
    case 'attached': return src.attachedTo === c.uid;
    case 'others': return c !== src && matches(g, c, s.f, ctl(src), src.uid);
    default: return matches(g, c, s.f, ctl(src), src.uid);
  }
}
/** Recompute continuous effects from static abilities (anthems, equipment, keyword grants, variable mana). */
const ART_SUBS = ['Equipment', 'Vehicle', 'Treasure', 'Food', 'Clue', 'Blood', 'Gold', 'Powerstone', 'Map', 'Contraption', 'Fortification', 'Attraction', 'Incubator', 'Bobblehead', 'Spacecraft', 'Junk', 'Lander', 'Terminus', 'Infinity', 'Stone'];
const ENCH_SUBS = ['Aura', 'Saga', 'Class', 'Shrine', 'Cartouche', 'Curse', 'Background', 'Rune', 'Room', 'Case', 'Role', 'Shard', 'Plan'];
/** Which card type a subtype belongs to (subtypes go away with their card type, rule 205.1a). */
function subFamily(s: string, orig: CardDef): string {
  if (LAND_TYPES.includes(s)) return 'Land'; if (ART_SUBS.includes(s)) return 'Artifact'; if (ENCH_SUBS.includes(s)) return 'Enchantment'; if (s === 'Siege') return 'Battle';
  if (orig.types.includes('Planeswalker') && !orig.types.includes('Creature') && subtypes(orig).includes(s)) return 'Planeswalker';
  if ((orig.types.includes('Instant') || orig.types.includes('Sorcery')) && subtypes(orig).includes(s)) return orig.types.includes('Instant') ? 'Instant' : 'Sorcery';
  return 'Creature';
}
/** Apply continuous effects in layer order (4 type, 5 color, 6 abilities, 7b base P/T), timestamp order within each layer. */
export function applyCEs(base: CardDef, list: (CEFx & { ts: number })[]): CardDef {
  const L = [...list].sort((a, b) => a.ts - b.ts);
  let types = [...base.types]; let subs = [...subtypes(base)];
  for (const e of L) {
    if (e.setTypes) types = [...e.setTypes];
    for (const t of e.addTypes ?? []) if (!types.includes(t)) types.push(t);
    if (e.setLand) subs = [...subs.filter(x => !LAND_TYPES.includes(x)), ...e.setLand];
    if (e.setCSub) subs = [...subs.filter(x => subFamily(x, base) !== 'Creature'), ...e.setCSub];
    for (const t of e.addSub ?? []) if (!subs.includes(t)) subs.push(t);
    subs = subs.filter(x => types.includes(subFamily(x, base)) || !!e.addSub?.includes(x) || !!e.setCSub?.includes(x));
  }
  let colors = [...base.colors];
  for (const e of L) { if (e.setColors) colors = [...e.setColors]; for (const k of e.addColors ?? []) if (!colors.includes(k)) colors.push(k); }
  const d: CardDef = { ...base, types, sub: subs, colors };
  let text = base.text;
  for (const e of L) {
    if (e.loseAll) { d.keywords = undefined; d.abilities = undefined; d.triggers = undefined; d.statics = undefined; d.static = undefined; d.mana = undefined; d.ward = undefined; d.mustAttack = undefined; d.loseTs = e.ts; text = ''; }
    if (e.addKw?.length) d.keywords = [...new Set([...(d.keywords ?? []), ...e.addKw])];
    if (e.grant) { const gr = e.grant; if (gr.mana) d.mana = [...(d.mana ?? []), ...gr.mana]; if (gr.abilities) d.abilities = [...(d.abilities ?? []), ...gr.abilities]; if (gr.triggers) d.triggers = [...(d.triggers ?? []), ...gr.triggers]; if (gr.statics) d.statics = [...(d.statics ?? []), ...gr.statics]; if (gr.text) text = [text, gr.text].filter(Boolean).join('\n'); }
  }
  for (const e of L) if (e.p !== undefined) { d.power = e.p; d.toughness = e.t ?? e.p; }
  if (types.includes('Creature') && d.power === undefined) { d.power = 0; d.toughness = 0; }
  d.text = text; d.typeLine = `${base.legendary ? 'Legendary ' : ''}${base.basic ? 'Basic ' : ''}${types.join(' ')}${subs.length ? ' — ' + subs.join(' ') : ''}`;
  return d;
}
/** Prepare: keep one castable copy of each prepared permanent's prepare spell in its controller's command zone. */
export function syncPrep(g: Game) {
  for (const p of g.players) {
    p.command = p.command.filter(x => { if (x.prepFor === undefined) return true; const s = p.battlefield.find(y => y.uid === x.prepFor); return !!s?.prepared; });
    for (const c of p.battlefield) { const pd = CARDS[c.id]?.prepDef; if (!c.prepared || !pd || p.command.some(x => x.prepFor === c.uid)) continue; CARDS[pd.id] ??= pd; p.command.push({ uid: g.nextUid++, id: pd.id, owner: p.id, tapped: false, sick: false, damage: 0, pp: 0, pt: 0, prepFor: c.uid }); }
  }
}
export const prepCopyOf = (g: Game, c: Card) => g.players[c.owner].command.find(x => x.prepFor === c.uid);
/** Grist-style "as long as this isn't on the battlefield" characteristics. */
export function offBfEff(c: Card) { const b = CARDS[c.id]; if (b?.offBf) c.eff = applyCEs(b, [{ ...b.offBf, ts: 0 }]); else delete c.eff; }
const BASIC_MANA: Record<string, ManaSym> = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };
/** A land with a basic land type has that type's mana ability (CR 305.6). */
function withBasicMana(d: CardDef): CardDef {
  if (!d.types.includes('Land')) return d;
  const need = subtypes(d).filter(s => BASIC_MANA[s]); if (!need.length) return d;
  const have = new Set((d.mana ?? []).flatMap(m => m.add.flatMap(a => a.split('|'))));
  const add = need.filter(s => !have.has(BASIC_MANA[s])); if (!add.length) return d;
  return { ...d, mana: [...(d.mana ?? []), ...add.map(s => ({ add: [BASIC_MANA[s]] }))] };
}
function computeEff(g: Game, c: Card): CardDef | undefined {
  const list: (CEFx & { ts: number })[] = (g.ces ?? []).filter(x => x.uid === c.uid);
  { const b = CARDS[c.id]; if (b?.stationAt && ctr(c, 'charge') >= b.stationAt) list.push({ ts: c.ts ?? 0, addTypes: ['Creature'] }); }
  if (c.anim) list.push({ ts: c.anim.ts ?? 0, addTypes: ['Creature'], p: c.anim.p, t: c.anim.t, addKw: c.anim.kw });
  if (c.floodIsle && (c.counters?.flood ?? 0) > 0 && CARDS[c.id]?.types.includes('Land')) list.push({ ts: c.ts ?? 1, addSub: ['Island'] });
  if (c.loseSrc !== undefined) { const s = findCard(g, c.loseSrc); if (s) list.push({ ts: (s.ts ?? 0) + 1, loseAll: true }); }
  const eff = list.length ? applyCEs(CARDS[c.id], list) : undefined;
  return eff ? withBasicMana(eff) : undefined;
}
export function layer(g: Game) {
  syncPrep(g);
  for (const p of g.players) if (!p.enduring && p.battlefield.some(c => def(c).storied) && p.battlefield.filter(c => isType(c, 'Artifact') || def(c).legendary || subtypes(def(c)).includes('Saga')).length >= 3) { p.enduring = true; log(g, `${p.name} has an enduring story.`); }
  for (const p of g.players) if (!p.speed && p.battlefield.some(c => CARDS[c.id]?.engines)) { p.speed = 1; log(g, `${p.name} starts their engines (speed 1).`); }
  const all = g.players.flatMap(p => p.battlefield);
  for (const c of all) { c.sp = 0; c.st = 0; c.skw = undefined; delete c.manaX; const e = computeEff(g, c); if (e) c.eff = e; else delete c.eff; }
  for (const src of liveSources(g)) {
    const d = def(src);
    if (d.static) for (const c of g.players[src.owner].battlefield) if (isType(c, 'Creature') && !(d.static.others && c === src)) { c.sp! += d.static.p; c.st! += d.static.t; }
    for (const s of d.statics ?? []) {
      if (s.k === 'basePT') { for (const c of all) if (staticApplies(g, s, src, c)) c.eff = { ...def(c), power: s.p as number, toughness: s.t as number }; continue; }
      if (s.k === 'grantMana') { for (const c of all) if (staticApplies(g, s, src, c)) c.eff = { ...def(c), mana: [...(def(c).mana ?? []), ...(s.mana ?? [])] }; continue; }
      if (s.k === 'manaExtra') { for (const c of g.players[ctl(src)].battlefield) if (matches(g, c, s.f, ctl(src)) && def(c).mana?.[0]) (c.manaX ??= []).push(...((s.add ?? []) as ManaSym[])); continue; }
      if (s.k === 'wardN') { for (const c of all) if (staticApplies(g, s, src, c)) c.eff = { ...def(c), ward: (def(c).ward ?? 0) + (s.n ?? 0) }; continue; }
      if (s.k === 'areIsland') { for (const c of all) if (isType(c, 'Land') && !CARDS[c.id]?.basic) c.eff = withBasicMana(applyCEs(CARDS[c.id], [{ ts: src.ts ?? 0, setLand: ['Island'], loseAll: true, grant: { mana: [{ add: ['U'] }] } }])); continue; }
      if (s.k !== 'pt' && s.k !== 'kw' && s.k !== 'cantBlock' && s.k !== 'unblockable' && s.k !== 'mustAttack' && s.k !== 'cantAttack' && s.k !== 'doesntUntap') continue;
      for (const c of all) {
        if (s.who !== 'self' && s.who !== 'attached' && !isType(c, 'Creature') && !s.f?.types && !s.f?.anyType) continue;
        if (!staticApplies(g, s, src, c)) continue;
        if (s.k === 'pt') { c.sp! += amtStatic(g, s.p, src); c.st! += amtStatic(g, s.t, src); }
        else if (s.k === 'kw' && c.eff?.loseTs && (src.ts ?? 0) < c.eff.loseTs) continue; // older ability grants are wiped by a later 'loses all abilities'
        else (c.skw ??= []).push(...(s.k === 'kw' ? s.kws ?? [] : [`_${s.k.toLowerCase()}`]));
      }
    }
  }
  for (const c of all) { const m = def(c).mana?.[0]; if (m?.n !== undefined) c.manaN = Math.max(0, amtStatic(g, m.n, c)); }
  if (g.highTide === g.turn) for (const c of all) if (isType(c, 'Land') && subtypes(def(c)).includes('Island')) (c.manaX ??= []).push('U');
  for (const c of all) if (c.loseSrc !== undefined && !findCard(g, c.loseSrc)) delete c.loseSrc;
  // Exotic Orchard / Fellwar Stone ('any color a land an opponent controls could produce'), Plaza of Heroes ('any color among legendary permanents you control')
  for (const p of g.players) {
    const oc = new Set<string>(); for (const q of g.players) if (q.id !== p.id && !q.lost) for (const l of q.battlefield) if (isType(l, 'Land')) for (const m of def(l).mana ?? []) for (const sy of m.add) { const b = sy.split('@')[0]; if (b !== 'OPP' && b !== 'LEGEND') for (const k of symColors0(q, b)) if (k !== 'C') oc.add(k); }
    p.oppCols = COLORS.filter(k => oc.has(k));
    const lc = new Set<string>(); for (const c of p.battlefield) if (def(c).legendary) for (const k of def(c).colors) lc.add(k); p.legCols = COLORS.filter(k => lc.has(k));
  }
}
function amtStatic(g: Game, a: Amt | undefined, src: Card): number { if (a === undefined) return 0; return amt(g, { item: { id: 0, kind: 'ability', controller: ctl(src), sourceId: src.id, sourceUid: src.uid, effects: [], label: '' }, i: 0, ans: {}, chosen: [], created: [] }, a); }
export const power = (g: Game, c: Card) => (def(c).power ?? 0) + (c.nx?.p ?? 0) + c.pp + (c.sp ?? 0) + ctr(c, '+1/+1') - ctr(c, '-1/-1');
export const toughness = (g: Game, c: Card) => (def(c).toughness ?? 0) + (c.nx?.t ?? 0) + c.pt + (c.st ?? 0) + ctr(c, '+1/+1') - ctr(c, '-1/-1');

// ---------------- mana ----------------
export const symColors = (p: Player, s0: string): string[] => { const s = s0.split('@')[0]; return symColors0(p, s); };
const symColors0 = (p: Player, s: string): string[] => s.includes('|') ? s.split('|') : s === 'ANY' ? COLORS : s === 'IDENTITY' ? (p.identity.length ? p.identity : ['C']) : s === 'OPP' ? p.oppCols ?? [] : s === 'LEGEND' ? p.legCols ?? [] : [s];
const canTapNow = (c: Card) => !c.tapped && (!isType(c, 'Creature') || !c.sick || hasKw(c, 'haste'));
const autoMana = (m: ManaAbility | undefined) => !!m && m.tap !== false && !m.cost;
export const manaSources = (p: Player) => p.battlefield.filter(c => autoMana(def(c).mana?.[0]) && canTapNow(c));
/** indexes of a card's automatic mana abilities */
const manaIdx = (c: Card) => (def(c).mana ?? []).map((m, i) => autoMana(m) ? i : -1).filter(i => i >= 0);
const unitsOf = (c: Card, i = 0) => { const m = def(c).mana![i]; const n = m.n !== undefined ? (i > 0 ? c.manaN ?? 0 : c.manaN ?? 0) : 1; return [...Array.from({ length: n }, () => m.add).flat(), ...(c.manaX ?? [])]; };
/** Mana symbols of `col` in a card's printed mana cost. Hybrid and Phyrexian symbols that include the color each count as one. */
export function colorPips(d: CardDef, col: Color): number { return (d.cost[col] ?? 0) + (d.cost.phy?.filter(x => x === col).length ?? 0) + (d.cost.hyb?.filter(h => h.split('|').includes(col)).length ?? 0); }
export const manaAvailable = (p: Player) => p.pool.length + manaSources(p).filter(c => !def(c).mana![0].sac).reduce((s, c) => s + unitsOf(c).length, 0);
export function costOf(g: Game, c: Card, o: { kicked?: boolean; flashback?: boolean; x?: number; warp?: boolean; sneak?: boolean; evoke?: boolean; mayhem?: boolean; webSling?: boolean; free?: boolean; omni?: boolean; surge?: boolean } = {}): Cost {
  const k0 = costOf0(g, c, o); if (!c.anyMana || !g.players.some(q => q.exile.includes(c))) return k0;
  const cs = ['W', 'U', 'B', 'R', 'G', 'C'] as const; const k = { ...k0 }; for (const s of cs) { k.generic += k[s] ?? 0; delete k[s]; } k.generic += k.hyb?.length ?? 0; delete k.hyb; return k;
}
function costOf0(g: Game, c: Card, o: { kicked?: boolean; flashback?: boolean; x?: number; warp?: boolean; sneak?: boolean; evoke?: boolean; mayhem?: boolean; webSling?: boolean; free?: boolean; omni?: boolean; surge?: boolean } = {}): Cost {
  const d = def(c); const p = g.players[c.owner];
  if (o.free && d.freeCmdr) return o.kicked && d.kicker ? { ...d.kicker } : { generic: 0 };
  if ((g.castNow?.uid === c.uid && g.castNow.free) || (c.mayFree === g.turn && p.exile.includes(c)) || (c.playFree && g.players.some(q => q.exile.includes(c)))) return o.kicked && d.kicker ? { ...d.kicker } : { generic: 0 }; // without paying its mana cost
  const base: Cost = { ...(o.omni ? { generic: 0 } : o.surge && d.surge ? d.surge : o.sneak && d.sneak ? d.sneak : o.warp && d.warp ? d.warp : o.evoke && d.evoke ? d.evoke : o.webSling && d.webSling ? d.webSling : o.mayhem && d.mayhem ? d.mayhem : o.flashback && (d.flashback || d.harmonize) ? (d.flashback ?? d.harmonize)! : c.foretold !== undefined && d.foretell && p.exile.includes(c) ? d.foretell : d.cost) };
  if (isCommander(g, c) && p.command.includes(c)) base.generic += 2 * (p.casts[c.id] ?? 0); // commander tax
  if (d.multikicker && !o.flashback) base.x = (base.x ?? 0) + d.multikicker;
  if (o.kicked && d.kicker) for (const k of ['generic', ...COLORS, 'C'] as const) (base as unknown as Record<string, number>)[k] = ((base as unknown as Record<string, number>)[k] ?? 0) + ((d.kicker as unknown as Record<string, number>)[k] ?? 0);
  if (o.omni) delete base.x; else if (base.x) base.generic += (o.x ?? 0) * base.x;
  if (o.flashback && d.flashback && d.flashbackLife) base.life = d.flashbackLife;
  if (d.costLessIf && condOk(g, c.owner, d.costLessIf.cond, c)) base.generic = Math.max(0, base.generic - d.costLessIf.n);
  if (d.selfCostLess) base.generic = Math.max(0, base.generic - d.selfCostLess.n * amtStatic(g, d.selfCostLess.per, c));
  // cost reduction / increase statics
  for (const q of g.players) for (const s of [...q.battlefield, ...emblemsOf(q)]) for (const st of def(s).statics ?? []) {
    if ((st.k !== 'costLess' && st.k !== 'costMore') || !st.n) continue;
    if (st.k === 'costLess' && q.id !== c.owner) continue;
    if (st.spellF && !matches(g, c, st.spellF, q.id)) continue;
    if (st.k === 'costLess') base.generic = Math.max(0, base.generic - st.n); else if (q.id !== c.owner) base.generic += st.n;
  }
  // Eluge: the first instant or sorcery this turn costs {U} less per flood land; excess colored reduction becomes generic (CR 118.7c).
  const firstIS = (d.types.includes('Instant') || d.types.includes('Sorcery')) && !(p.spells?.turn === g.turn && p.spells.ins);
  if (firstIS) for (const s of p.battlefield) for (const st of def(s).statics ?? []) if (st.k === 'pipLess' && st.color && ctl(s) === c.owner) {
    const n = amtStatic(g, st.p, s); const have = (base[st.color] ?? 0); const cut = Math.min(have, n);
    if (cut) base[st.color] = have - cut; base.generic = Math.max(0, base.generic - (n - cut));
  }
  return base;
}
export interface Payment { /** which mana ability of each src */ abs?: number[]; /** restriction tags of mana used */ tags?: string[]; srcs: Card[]; pool: number[]; life: number; left: string[]; conv: Card[] }
/** Mana abilities don't use the stack: choose floating mana and sources (lands, rocks, dorks) that pay the cost. */
export function planPayment(p: Player, cost: Cost, o: PayOpts = {}): Payment | null {
  type Src = { c?: Card; i?: number; pi?: number; units: string[][]; rank: number };
  const tagU = (u: string[], tg?: string) => { if (tg) (u as Tagged).tag = tg; return u; };
  const srcs: Src[] = [
    ...p.pool.map((s, pi) => ({ pi, units: [tagU(symColors(p, s), s.split('@')[1])], rank: 0 })).filter(x => { const tg = (x.units[0] as Tagged).tag; return !tg || restrOk(tg, o.spend); }),
    ...manaSources(p).filter(c => c.uid !== o.exclude).flatMap(c => manaIdx(c).filter(i => !manaTag(c, i) || restrOk(manaTag(c, i)!, o.spend)).map(i => ({ c, i, units: unitsOf(c, i).map(s => tagU(symColors(p, s), manaTag(c, i))).filter(u => u.length), rank: def(c).mana![i].sac ? 3 : isType(c, 'Creature') ? 2 : 1 })).filter(x => x.units.length)),
  ];
  if (o.convoke) for (const c of creatures(p)) if (!c.tapped && c.uid !== o.exclude && !srcs.some(s => s.c === c)) srcs.push({ c, units: [[...def(c).colors, 'C']], rank: 4 });
  if (o.wb) { let k = 0; for (const c of p.battlefield) if (k < o.wb && !c.tapped && c.uid !== o.exclude && (isType(c, 'Creature') || isType(c, 'Artifact')) && !srcs.some(s => s.c === c)) { srcs.push({ c, units: [['WB']], rank: 4 }); k++; } }
  const flex = (s: Src) => new Set(s.units.flat()).size;
  const chosen = new Set<Src>(); const pool: string[][] = []; let life = 0;
  const take = (ok: (u: string[]) => boolean, generic: boolean, remaining: number) => {
    const i = pool.findIndex(ok); if (i >= 0) { pool.splice(i, 1); return true; }
    const cand = srcs.filter(s => !chosen.has(s) && !(s.c && [...chosen].some(x => x.c === s.c)) && s.units.some(ok))
      .sort((a, b) => a.rank - b.rank || flex(a) - flex(b) || (generic ? (remaining >= 2 ? b.units.length - a.units.length : a.units.length - b.units.length) : 0))[0];
    if (!cand) return false;
    chosen.add(cand); const u = [...cand.units]; u.splice(u.findIndex(ok), 1); pool.push(...u); return true;
  };
  const avail = (k: string) => srcs.some(s => s.units.some(u => u.includes(k)));
  let generic = cost.generic;
  const req: string[][] = [];
  for (const k of [...COLORS, 'C'] as const) for (let i = 0; i < ((cost as unknown as Record<string, number>)[k] || 0); i++) req.push([k]);
  for (const h of cost.hyb ?? []) { const [a, b] = h.split('|'); if (a === '2') { if (avail(b)) req.push([b]); else generic += 2; } else req.push([a, b]); }
  for (const k of cost.phy ?? []) { if (avail(k)) req.push([k]); else life += 2; }
  req.sort((a, b) => a.length - b.length);
  for (const r of req) if (!take(u => u.some(x => r.includes(x)), false, 0)) return null;
  for (let i = 0; i < generic; i++) if (!take(() => true, true, generic - i)) return null;
  if (life && p.life <= life) return null;
  if (cost.life) { if (p.life < life + cost.life) return null; life += cost.life; }
  const all = [...chosen];
  const used = all.filter(s => s.c && s.rank < 4);
  return { abs: used.map(s => s.i ?? 0), tags: all.flatMap(s => s.units.map(u => (u as Tagged).tag).filter((t): t is string => !!t)), srcs: used.map(s => s.c!), pool: all.filter(s => s.pi !== undefined).map(s => s.pi!), life, left: pool.map(u => (u.length >= 5 ? 'ANY' : u.join('|')) + ((u as Tagged).tag ? '@' + (u as Tagged).tag : '')), conv: all.filter(s => s.rank === 4).map(s => s.c!) };
}
type Tagged = string[] & { tag?: string };
/** What mana is being spent on (for "spend this mana only to …" restrictions). */
export interface Spend { spell?: CardDef; act?: Card }
export interface PayOpts { exclude?: number; convoke?: boolean; wb?: number; spend?: Spend }
/** Restriction tag of a mana source's mana: '<code>:<chosen type>'. */
const manaTag = (c: Card, i = 0) => { const o = def(c).mana?.[i]?.only; return o ? `${o}:${c.chosenType ?? ''}` : undefined; };
/** May mana with this restriction tag be spent this way? */
export function restrOk(tag: string, sp?: Spend): boolean {
  const [code, ty] = tag.split(':'); const sd = sp?.spell; const ad = sp?.act ? def(sp.act) : undefined;
  switch (code) {
    case 'artifact': return !sd || sd.types.includes('Artifact');
    case 'hero': case 'villain': { const T = code === 'hero' ? 'Hero' : 'Villain'; return (!!sd && isTypeOrSub(sd, T)) || (!!ad && isTypeOrSub(ad, T)); }
    case 'ctypeSpell': return !!sd && !!ty && sd.types.includes('Creature') && isTypeOrSub(sd, ty);
    case 'ctypeAny': return !!ty && ((!!sd && sd.types.includes('Creature') && isTypeOrSub(sd, ty)) || (!!ad && ad.types.includes('Creature') && isTypeOrSub(ad, ty)));
    case 'legendary': return !!sd?.legendary;
    case 'path': case 'keep': return true;
  }
  return false;
}
/** Sources to tap for a cost (null if unaffordable). */
export function findPayment(p: Player, cost: Cost, exclude?: number): Card[] | null { const pl = planPayment(p, cost, { exclude }); return pl ? pl.srcs : null; }
function payPlan(g: Game, p: Player, pl: Payment) {
  for (const c of [...pl.srcs, ...pl.conv]) c.tapped = true;
  p.pool = p.pool.filter((_, i) => !pl.pool.includes(i)); p.pool.push(...pl.left);
  if (pl.life) loseLife(g, p.id, pl.life);
  for (const [k, c] of pl.srcs.entries()) if (def(c).mana?.[pl.abs?.[k] ?? 0]?.sac) { log(g, `${p.name} sacrifices ${nm(c)} for mana.`); sacrifice(g, c); }
  for (const [k, c] of pl.srcs.entries()) { const pn = def(c).mana?.[pl.abs?.[k] ?? 0]?.pain; if (pn) dealDamage(g, c.id, c, { player: p.id }, pn); }
}
function pay(g: Game, p: Player, cost: Cost, o: PayOpts = {}) { const s = planPayment(p, cost, o); if (!s) return false; payPlan(g, p, s); return true; }
/** Manually tap a mana source to add its mana to the floating pool. */
export function tapForMana(g: Game, pid: number, uid: number, ai = 0) {
  const p = g.players[pid]; const c = p.battlefield.find(x => x.uid === uid);
  if (!c || !autoMana(def(c).mana?.[0]) || !canTapNow(c) || g.winner !== null) return false;
  if (!def(c).mana?.[ai] || !autoMana(def(c).mana![ai])) return false;
  c.tapped = true; const u = unitsOf(c, ai).filter(s => symColors(p, s).length); const tg = manaTag(c, ai); p.pool.push(...u.map(s => (s === 'IDENTITY' ? (p.identity.length > 1 ? p.identity.join('|') : p.identity[0] ?? 'C') : s) + (tg ? '@' + tg : '')));
  if (def(c).mana![ai].sac) sacrifice(g, c);
  if (def(c).mana![ai].pain) dealDamage(g, c.id, c, { player: pid }, def(c).mana![ai].pain!);
  log(g, `${p.name} taps ${nm(c)} for ${u.map(s => `{${s}}`).join('')}.`); return true;
}

// ---------------- targeting ----------------
export function slotOf(spec: TargetSpec): TSlot {
  switch (spec) {
    case 'any': return { who: 'any', harm: true };
    case 'creature': return { who: 'perm', f: { types: ['Creature'] } };
    case 'oppCreature': return { who: 'perm', f: { types: ['Creature'], ctrl: 'opp' }, harm: true };
    case 'tappedCreature': return { who: 'perm', f: { types: ['Creature'], tapped: true }, harm: true };
    case 'nonblackCreature': return { who: 'perm', f: { types: ['Creature'], notColors: ['B'] }, harm: true };
    case 'nonartifactCreature': return { who: 'perm', f: { types: ['Creature'], notTypes: ['Artifact'] }, harm: true };
    case 'spell': return { who: 'spell', harm: true };
    case 'noncreatureSpell': return { who: 'spell', f: { notTypes: ['Creature'] }, harm: true };
    case 'creatureSpell': return { who: 'spell', f: { types: ['Creature'] }, harm: true };
  }
}
export const needsTarget = (d: CardDef) => !!d.spell?.target || !!d.spell?.tslots?.length;
const protFrom = (c: Card, colors: Color[]) => colors.some(k => hasKw(c, `protection from ${({ W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' } as const)[k]}`));
export interface TCtx { selfStackId?: number; srcUid?: number; srcId?: string; taken?: (Target | undefined)[]; /** the slots the 'taken' targets were chosen for (same order) */ takenSlots?: (TSlot | undefined)[] }
export function validSlot(g: Game, pid: number, slot: TSlot, t: Target | undefined, x: TCtx = {}): boolean {
  if (!t) return !!slot.opt;
  if (slot.xIdx !== undefined) { const s = x.srcUid !== undefined ? findCard(g, x.srcUid) : undefined; if (!s || (s.x ?? 0) <= slot.xIdx) return false; }
  if (t.player !== undefined && t.player !== pid && liveSources(g).some(c => ctl(c) === t.player && def(c).statics?.some(st => st.k === 'playerHexproof'))) return false;
  if (t.player !== undefined && liveSources(g).some(c => ctl(c) === t.player && def(c).statics?.some(st => st.k === 'playerHexproof' && st.kws?.[0] === 'shroud'))) return false;
  // 115.3: one object can't be chosen twice for the same word 'target', but different 'target' words may pick the same object
  if (x.taken?.some((o, j) => o && ((o.card !== undefined && o.card === t.card) || (o.player !== undefined && o.player === t.player) || (o.stack !== undefined && o.stack === t.stack)) && (slot.distinct || (slot.grp !== undefined && x.takenSlots?.[j]?.grp === slot.grp)))) return false;
  if (slot.who === 'spell' || slot.who === 'ability' || slot.who === 'stack') {
    const it = g.stack.find(s => s.id === t.stack); if (!it || it.id === x.selfStackId) return false;
    if (slot.who === 'ability') return it.kind !== 'spell';
    if (slot.who === 'stack') return it.kind === 'spell' ? !!it.card && matches(g, it.card, slot.f, pid, x.srcUid) : true;
    return it.kind === 'spell' && matches(g, it.card!, slot.f, pid, x.srcUid);
  }
  if (t.card !== undefined) {
    if (slot.who === 'card') {
      const l = locate(g, t.card); if (!l || l.zone !== 'graveyard') return false;
      if (slot.zoneOwner === 'you' && l.p.id !== pid) return false; if (slot.zoneOwner === 'opp' && l.p.id === pid) return false;
      return matches(g, l.c, slot.f, pid, x.srcUid);
    }
    if (slot.who !== 'perm' && slot.who !== 'any') return false;
    const c = findCard(g, t.card); if (!c) return false;
    if (ctl(c) !== pid && (hasKw(c, 'hexproof') || hasKw(c, 'shroud'))) return false;
    if (ctl(c) === pid && hasKw(c, 'shroud')) return false;
    if (x.srcId && protFrom(c, CARDS[x.srcId]?.colors ?? [])) return false;
    if (slot.who === 'any' && !isType(c, 'Creature') && !isType(c, 'Planeswalker') && !isType(c, 'Battle')) return false;
    if (slot.oppIdx !== undefined && ctl(c) !== opponents(g, pid)[slot.oppIdx]?.id) return false;
    return matches(g, c, slot.f, pid, x.srcUid);
  }
  if (t.player !== undefined) {
    const p = g.players[t.player]; if (!p || p.lost) return false;
    if (slot.who === 'any' || slot.who === 'player') return true;
    return slot.who === 'opp' && t.player !== pid;
  }
  return false;
}
export function validTarget(g: Game, pid: number, spec: TargetSpec | TSlot | undefined, t: Target | undefined, selfStackId?: number): boolean {
  if (!spec) return true; return validSlot(g, pid, typeof spec === 'string' ? slotOf(spec) : spec, t, { selfStackId });
}
export function slotTargets(g: Game, pid: number, slot: TSlot, x: TCtx = {}): Target[] {
  const all: Target[] = slot.who === 'spell' || slot.who === 'ability' || slot.who === 'stack' ? g.stack.map(s => ({ stack: s.id }))
    : slot.who === 'card' ? g.players.flatMap(p => p.graveyard.map(c => ({ card: c.uid })))
    : slot.who === 'player' || slot.who === 'opp' ? g.players.map(p => ({ player: p.id }))
    : [...g.players.flatMap(p => p.battlefield.map(c => ({ card: c.uid }))), ...(slot.who === 'any' ? g.players.map(p => ({ player: p.id })) : [])];
  return all.filter(t => validSlot(g, pid, slot, t, x));
}
export function legalTargets(g: Game, pid: number, spec?: TargetSpec | TSlot): Target[] { if (!spec) return []; return slotTargets(g, pid, typeof spec === 'string' ? slotOf(spec) : spec); }
/** Can every required slot get a (distinct) legal target? */
export function slotsFillable(g: Game, pid: number, slots: TSlot[] | undefined, x: TCtx = {}): boolean {
  if (!slots) return true; const taken: Target[] = []; const takenSlots: TSlot[] = [];
  for (const s of slots) { if (s.opt) continue; const t = slotTargets(g, pid, s, { ...x, taken, takenSlots }); if (!t.length) return false; taken.push(t[0]); takenSlots.push(s); }
  return true;
}
export function describeTarget(g: Game, t?: Target): string {
  if (!t) return '';
  if (t.player !== undefined) return g.players[t.player].name;
  if (t.card !== undefined) { const l = locate(g, t.card); return l ? `${nm(l.c)} (${l.p.name}${l.zone !== 'battlefield' ? `'s ${l.zone}` : ''})` : '(gone)'; }
  const s = g.stack.find(x => x.id === t.stack); return s ? `${s.label}` : '(gone)';
}
export const itemTargets = (it: StackItem): Target[] => (it.targets ?? (it.target ? [it.target] : [])).filter((t): t is Target => !!t);

// ---------------- casting & abilities ----------------
export const isMain = (g: Game) => g.step === 'main1' || g.step === 'main2';
/** Loyalty abilities of this walker may be activated at instant speed (Wandering Emperor, Teferi emblems). */
export const pwInstant = (g: Game, c: Card) => hasPStatic(g, [ctl(c)], 'pwInstant', (st, s) => st.who === 'all' || s === c);
export const sorceryTiming = (g: Game, pid: number) => g.active === pid && isMain(g) && g.stack.length === 0 && !g.awaiting;
export const hasPriority = (g: Game, pid: number) => g.started && g.winner === null && g.priority === pid && !g.choice && !g.awaiting && !g.decision && !g.res;
const maxLands = (g: Game, p: Player) => 1 + (p.extraLands ?? 0) + p.battlefield.reduce((s, c) => s + (def(c).statics?.some(x => x.k === 'noMaxHand' && x.n === -1) ? 1 : 0), 0);
export function canPlayLand(g: Game, pid: number, c: Card, back = false): boolean {
  const p = g.players[pid];
  if (back) { const f = frontDef(c); if (!f?.mdfc || !f.back?.types.includes('Land') || c.face) return false; return withBack(c, () => canPlayLand(g, pid, c)); }
  return hasPriority(g, pid) && sorceryTiming(g, pid) && (p.landsPlayed ?? 0) < maxLands(g, p) && isType(c, 'Land') && (p.hand.includes(c) || (!!c.mayPlay && (c.owner === pid || c.playBy === pid) && p.exile.includes(c)) || (p.graveyard.includes(c) && p.battlefield.some(x => def(x).landsFromGy)));
}
export function playLand(g: Game, pid: number, uid: number, back = false) {
  const p = g.players[pid]; const c = [...p.hand, ...p.exile, ...p.graveyard].find(x => x.uid === uid); if (!c || !canPlayLand(g, pid, c, back)) return false;
  if (back) flipFace(c); const fromEx = p.exile.includes(c);
  p.hand = p.hand.filter(x => x !== c); p.exile = p.exile.filter(x => x !== c); p.graveyard = p.graveyard.filter(x => x !== c); delete c.mayPlay; delete c.playBy; delete c.playFree; delete c.anyMana; if (fromEx) emit(g, 'playExile', { player: pid }, c);
  p.landPlayed = true; p.landsPlayed = (p.landsPlayed ?? 0) + 1; log(g, `${p.name} plays ${nm(c)}.`); enter(g, c, pid, {}); acted(g); return true;
}
/** Foretell (special action, your turn): pay {2}, exile it face down; cast it on a later turn for its foretell cost. */
export function canForetell(g: Game, pid: number, c: Card): boolean { const p = g.players[pid]; return !!frontDef(c)?.foretell && !c.face && g.active === pid && hasPriority(g, pid) && p.hand.includes(c) && !!planPayment(p, { generic: 2 }); }
export function foretell(g: Game, pid: number, uid: number): boolean {
  const p = g.players[pid]; const c = p.hand.find(x => x.uid === uid); if (!c || !canForetell(g, pid, c)) return false;
  const plan = planPayment(p, { generic: 2 }); if (!plan) return false; payPlan(g, p, plan);
  p.hand = p.hand.filter(x => x !== c); p.exile.push(c); c.foretold = g.turn; log(g, `${p.name} foretells a card.`); acted(g); return true;
}
export const instantSpeed = (d: CardDef) => d.types.includes('Instant') || !!d.keywords?.includes('flash');
/** All target slots of a spell (modal spells: every mode's slots, globally indexed). */
export function spellSlots(d: CardDef): TSlot[] { if (d.spell?.modes) return d.spell.modes.list.flatMap(m => m.tslots ?? []); if (d.aura && isPermanentCard(d)) return [d.aura]; return d.spell?.tslots ?? (d.spell?.target ? [slotOf(d.spell.target)] : []); }
export function modeRange(m: Modes, i: number): number[] { let o = 0; for (let j = 0; j < i; j++) o += m.list[j].tslots?.length ?? 0; return Array.from({ length: m.list[i].tslots?.length ?? 0 }, (_, k) => o + k); }
/** Where a card can be cast from right now. */
/** A permanent you control lets you cast this spell from the top of your library. */
export function topCastable(g: Game, pid: number, c: Card): boolean {
  const p = g.players[pid]; if (p.library[p.library.length - 1] !== c) return false;
  return p.battlefield.some(s => def(s).statics?.some(st => st.k === 'topCast' && matches(g, c, st.spellF, pid)));
}
/** You may look at the top card of your library (Emperor Mihail II). */
export const topLook = (g: Game, pid: number) => g.players[pid].battlefield.some(s => def(s).statics?.some(st => st.k === 'topLook'));
export const omniOn = (g: Game, pid: number) => g.players[pid].battlefield.some(s => def(s).statics?.some(st => st.k === 'omni'));
export function castZone(g: Game, pid: number, c: Card): 'hand' | 'command' | 'flashback' | 'exile' | 'graveyard' | 'mayhem' | 'library' | null {
  const p = g.players[pid];
  if (p.hand.includes(c)) return 'hand'; if (p.command.includes(c)) return 'command';
  if (topCastable(g, pid, c)) return 'library';
  if (c.owner === pid && p.exile.includes(c) && (c.onAdv || (c.foretold !== undefined && c.foretold < g.turn && !!frontDef(c)?.foretell))) return 'exile';
  if (c.mayPlay && c.mayPlay >= g.turn && p.exile.includes(c) && !(c.warpAfter !== undefined && c.warpAfter >= g.turn)) return 'exile';
  if (p.graveyard.includes(c) && def(c).gyDiscard && !c.mayPlay && p.hand.length) return 'graveyard';
  if (p.graveyard.includes(c)) return def(c).flashback || def(c).harmonize ? 'flashback' : def(c).mayhem && c.discarded === g.turn ? 'mayhem' : c.mayPlay ? 'graveyard' : null;
  return null;
}
export interface CastOpts { /** cast for its overload cost */ overload?: boolean; /** cast without paying its mana cost (if you control a commander) */ free?: boolean; /** Omniscience: cast from hand without paying its mana cost */ omni?: boolean; /** cast for its surge cost */ surge?: boolean; /** Louisoix's Sacrifice: pay {2} instead of sacrificing */ orPay?: boolean; evoke?: boolean; webSling?: boolean; webRet?: number; harmTap?: number; /** cast the back face (modal DFC) or the Adventure */ back?: boolean; sneak?: boolean; sneakRet?: number; teamwork?: boolean | number[]; warp?: boolean; sacs?: number[]; discards?: number[]; targets?: (Target | undefined)[]; modes?: number[]; x?: number; kicked?: boolean; flashback?: boolean }
const isTarget = (o: unknown): o is Target => !!o && typeof o === 'object' && ('player' in o || 'card' in o || 'stack' in o);
function modesOk(g: Game, pid: number, m: Modes, x: TCtx) { const n = m.list.filter(md => slotsFillable(g, pid, md.tslots, x)).length; return m.repeat ? n >= 1 : n >= m.min; }
const wardCost = (g: Game, pid: number, ts: (Target | undefined)[]) => ts.reduce((s, t) => { const c = t?.card !== undefined ? findCard(g, t.card) : undefined; return s + (c && ctl(c) !== pid ? def(c).ward ?? 0 : 0); }, 0);
/** 'You may cast that card' while an ability resolves: timing and priority don't apply. */
const isCastNow = (g: Game, pid: number, c: Card) => g.castNow?.uid === c.uid && g.castNow.pid === pid;
/** Can the back face / Adventure of this card be cast from where it is? */
export function backCastable(g: Game, pid: number, c: Card): boolean {
  const f = frontDef(c); const b = f?.back; if (!b || c.face || c.onAdv || !(f.mdfc || b.adventure) || b.types.includes('Land')) return false;
  const z = castZone(g, pid, c); return z === 'hand' || (z === 'command' && !!f.mdfc) || (z === 'exile' && !c.foretold);
}
function withBack<T>(c: Card, f: () => T): T { flipFace(c); try { return f(); } finally { frontFace(c); } }
export function canCast(g: Game, pid: number, c: Card, o: CastOpts = {}): boolean {
  if (o.overload) { const oid = overloadId(c.id); if (!oid) return false; const id0 = c.id; c.id = oid; c.face = id0; try { return canCast(g, pid, c, { ...o, overload: false }); } finally { c.id = id0; delete c.face; } }
  if (o.back) return backCastable(g, pid, c) && withBack(c, () => canCast(g, pid, c, { ...o, back: false }));
  const p = g.players[pid]; const d = def(c); const now = isCastNow(g, pid, c);
  if ((!now && !hasPriority(g, pid)) || p.lost || isType(c, 'Land')) return false;
  const z = castZone(g, pid, c) ?? (now && p.exile.includes(c) ? 'exile' : null); if (!z) return false;
  const sneakOk = !!o.sneak && !!d.sneak && z === 'hand' && sneakRets(g, pid).length > 0; if (o.sneak && !sneakOk) return false;
  if (!now && !sneakOk && !instantSpeed(d) && !(p.flashSorc && d.types.includes('Sorcery')) && !sorceryTiming(g, pid) && !anyFlash(g, pid) && !(p.flashT?.turn === g.turn && subtypes(d).includes(p.flashT.type))) return false;
  if (!now && p.noCastT === g.turn) return false;
  if (!now && !sorceryTiming(g, pid) && hasPStatic(g, oppIds(g, pid), 'oppsSorcery')) return false;
  const x: TCtx = { srcId: c.id };
  if (d.spell?.modes ? !modesOk(g, pid, d.spell.modes, x) : !slotsFillable(g, pid, spellSlots(d), x)) return false;
  if (d.extraCost?.sacF && p.battlefield.filter(q => matches(g, q, d.extraCost!.sacF!.f, pid)).length < d.extraCost.sacF.n) return false;
  if (d.extraCost?.discard && p.hand.filter(q => q !== c).length < d.extraCost.discard) return false;
  if (d.extraCost?.life && p.life < d.extraCost.life) return false;
  if (d.extraCost?.lifeX && p.life < (o.x ?? 0)) return false;
  if (o.warp && (!d.warp || z !== 'hand')) return false;
  if (o.evoke && !d.evoke) return false;
  if (o.free && !(d.freeCmdr && ctlCommander(g, pid))) return false;
  if (o.omni && (z !== 'hand' || !omniOn(g, pid))) return false;
  if (o.surge && (!d.surge || !(p.spells?.turn === g.turn && p.spells.n >= 1))) return false;
  if (o.webSling && (!d.webSling || !webRets(g, pid).length)) return false;
  const cost = costOf(g, c, { kicked: o.kicked, flashback: z === 'flashback', mayhem: z === 'mayhem', x: o.omni ? 0 : o.x ?? 0, warp: o.warp, sneak: o.sneak, evoke: o.evoke, webSling: o.webSling, free: o.free, omni: o.omni, surge: o.surge });
  if (d.costOr && o.orPay) cost.generic += d.costOr.pay;
  const pay = !!planPayment(p, cost, { convoke: d.convoke, spend: { spell: d } }) || (z === 'flashback' && !d.flashback && !!d.harmonize && !!harmPick(g, pid, cost, d));
  if (!d.costOr || o.orPay) return pay;
  const orCost = d.costOr;
  const canSac = p.battlefield.filter(q => q !== c && matches(g, q, orCost.sacF.f, pid)).length >= orCost.sacF.n;
  if (canSac && pay) return true;
  cost.generic += orCost.pay; return !!planPayment(p, cost, { convoke: d.convoke, spend: { spell: d } });
}
/** Tapped creatures that could be returned for web-slinging. */
export const webRets = (g: Game, pid: number) => creatures(g.players[pid]).filter(c => c.tapped);
/** Harmonize: the creature to tap (least power that makes the cost affordable), or null. */
function harmPick(g: Game, pid: number, cost: Cost, d: CardDef, want?: number): Card | null {
  const p = g.players[pid]; const cs = creatures(p).filter(c => !c.tapped && power(g, c) > 0 && (want === undefined || c.uid === want)).sort((a, b) => power(g, a) - power(g, b));
  return cs.find(c => !!planPayment(p, { ...cost, generic: Math.max(0, cost.generic - power(g, c)) }, { exclude: c.uid, convoke: d.convoke, spend: { spell: d } })) ?? null;
}
/** Largest X the player can pay for (0 if the spell has no X). */
export function maxX(g: Game, pid: number, c: Card, o: { kicked?: boolean; abil?: Cost; exclude?: number } = {}) {
  if (!o.abil && def(c).extraCost?.lifeX) return Math.max(0, g.players[pid].life);
  const base = o.abil ?? costOf(g, c, { kicked: o.kicked, flashback: castZone(g, pid, c) === 'flashback' }); if (!base.x) return 0;
  let x = 0; while (x < 30 && planPayment(g.players[pid], { ...base, generic: base.generic + (x + 1) * base.x, x: 0 }, { exclude: o.exclude, convoke: def(c).convoke, spend: o.abil ? { act: c } : { spell: def(c) } })) x++; return x;
}
function checkTargets(g: Game, pid: number, slots: TSlot[], ts: (Target | undefined)[], active: number[], x: TCtx): boolean {
  const taken: (Target | undefined)[] = []; const takenSlots: TSlot[] = [];
  for (const i of active) { if (!validSlot(g, pid, slots[i], ts[i], { ...x, taken, takenSlots })) return false; taken.push(ts[i]); takenSlots.push(slots[i]); }
  return true;
}
export function modesMax(g: Game, pid: number, m: Modes, o: CastOpts = {}): number { if (m.escalate) return Math.min(m.max, 1 + g.players[pid].battlefield.filter(c => isType(c, 'Creature') && !c.tapped).length); if (!m.bothIf) return m.max; return (m.bothIf.k === 'teamwork' ? !!o.teamwork : condOk(g, pid, m.bothIf)) ? 2 : m.max; }
export function teamworkPick(g: Game, pid: number, c: Card, prefer: number[] = []): Card[] | null { const n = def(c).teamwork; return n === undefined ? null : crewPick(g, pid, c, n, prefer); }
/** Unblocked attackers pid could return to cast a spell for its sneak cost right now. */
export function sneakRets(g: Game, pid: number): Card[] { if (g.step !== 'blockers' || g.awaiting === 'block' || g.active !== pid) return []; return g.players[pid].battlefield.filter(c => c.attacking !== undefined && !(c.blockedBy?.length)); }
/** Renumber tN references so a repeated mode gets its own targets. */
function remapFx(fx: Effect[], map: Map<number, number>): Effect[] {
  const rw = (w: Ref | undefined): Ref | undefined => { if (typeof w !== 'string') return w; const m = /^t(\d+)$/.exec(w); return m && map.has(+m[1]) ? 't' + map.get(+m[1]) : w; };
  const rp = (pl?: string) => { if (!pl) return pl; const m = /^ctl:t(\d+)$/.exec(pl); return m && map.has(+m[1]) ? 'ctl:t' + map.get(+m[1]) : pl; };
  return fx.map(e => ({ ...e, who: rw(e.who), other: typeof e.other === 'string' || (e.other && typeof e.other === 'object') ? rw(e.other as Ref) : e.other, pl: rp(e.pl) as PRef | undefined, sub: e.sub ? remapFx(e.sub, map) : e.sub, else: e.else ? remapFx(e.else, map) : e.else }));
}
/** Spells/abilities an opponent controls that target a Merfolk you control cost {N} more (Kopala). Once per source, not per target. */
function merfolkTax(g: Game, pid: number, ts: (Target | undefined)[], kind: 'taxSpell' | 'taxAct'): number {
  let add = 0;
  for (const src of liveSources(g)) if (ctl(src) !== pid) for (const st of def(src).statics ?? []) if (st.k === kind && ts.some(t => { const c = t?.card !== undefined ? findCard(g, t.card) : undefined; return !!c && ctl(c) === ctl(src) && matches(g, c, st.spellF, ctl(src)); })) add += st.n ?? 2;
  return add;
}
export function castSpell(g: Game, pid: number, uid: number, opt?: Target | CastOpts): boolean {
  const o: CastOpts = isTarget(opt) ? { targets: [opt] } : opt ?? {};
  const p = g.players[pid]; const c = [...p.hand, ...p.command, ...p.graveyard, ...p.exile, ...(p.library.length && topCastable(g, pid, p.library[p.library.length - 1]) ? [p.library[p.library.length - 1]] : [])].find(x => x.uid === uid); if (!c) return false;
  if (o.overload) { const oid = overloadId(c.id); if (!oid) return false; const id0 = c.id; c.id = oid; c.face = id0; const ok = castSpell(g, pid, uid, { ...o, overload: false }); if (!ok) { c.id = id0; delete c.face; } else log(g, `(${nm(c)} was cast for its overload cost.)`); return ok; }
  if (o.back) { if (!backCastable(g, pid, c)) return false; flipFace(c); const ok = castSpell(g, pid, uid, { ...o, back: false }); if (!ok) frontFace(c); return ok; }
  const now = isCastNow(g, pid, c); const z = castZone(g, pid, c); const fb = z === 'flashback';
  if (!canCast(g, pid, c, { kicked: o.kicked, x: o.x, warp: o.warp, sneak: o.sneak, evoke: o.evoke, webSling: o.webSling, free: o.free, omni: o.omni, surge: o.surge, orPay: o.orPay })) return false;
  const sneakRet = o.sneak ? (sneakRets(g, pid).find(q => q.uid === o.sneakRet) ?? sneakRets(g, pid).sort((a, b) => valueOf(g, a) - valueOf(g, b))[0]) : undefined;
  const d = def(c); let slots = spellSlots(d); const ts0 = o.targets ?? [];
  let modes: number[] | undefined; let active = slots.map((_, i) => i); let repFx: Effect[] | undefined;
  if (d.spell?.modes) {
    modes = o.modes ?? []; const m = d.spell.modes;
    const mx = modesMax(g, pid, m, o);
    if (modes.length < m.min || modes.length > mx || (!m.repeat && new Set(modes).size !== modes.length) || modes.some(i => !m.list[i])) return false;
    if (m.repeat) {
      const all = m.list.flatMap(md => md.tslots ?? []); const built: TSlot[] = []; const fx: Effect[] = [];
      for (const i of modes) { const idxs = modeRange(m, i); const map = new Map(idxs.map((old, k) => [old, built.length + k])); built.push(...idxs.map(j => ({ ...all[j] }))); fx.push(...remapFx(m.list[i].effects, map)); }
      slots = built; active = built.map((_, i) => i); repFx = fx;
    } else active = modes.flatMap(i => modeRange(m, i));
  }
  const ts = d.spell?.modes?.repeat ? ts0 : ts0;
  if (!checkTargets(g, pid, slots, ts, active, { srcId: c.id })) return false;
  const cost = costOf(g, c, { kicked: o.kicked, flashback: fb, mayhem: z === 'mayhem', x: o.omni ? 0 : o.x ?? 0, warp: o.warp, sneak: o.sneak, evoke: o.evoke, webSling: o.webSling, free: o.free, omni: o.omni, surge: o.surge }); cost.generic += wardCost(g, pid, active.map(i => ts[i])) + merfolkTax(g, pid, active.map(i => ts[i]), 'taxSpell');
  let payInstead = !!o.orPay; const orCost = d.costOr; if (orCost && (payInstead || !p.battlefield.some(q => q !== c && matches(g, q, orCost.sacF.f, pid)))) { cost.generic += orCost.pay; payInstead = true; }
  const webRet = o.webSling ? (webRets(g, pid).find(q => q.uid === o.webRet) ?? webRets(g, pid).sort((a, b) => valueOf(g, a) - valueOf(g, b))[0]) : undefined; if (o.webSling && !webRet) return false;
  let harm: Card | null = null;
  if (fb && !d.flashback && d.harmonize && (o.harmTap !== undefined || !planPayment(p, cost, { convoke: d.convoke, spend: { spell: d } }))) { harm = harmPick(g, pid, cost, d, o.harmTap); if (!harm) return false; cost.generic = Math.max(0, cost.generic - power(g, harm)); harm.tapped = true; log(g, `${p.name} taps ${nm(harm)} for harmonize.`); }
  let team: Card[] | null = null; if (o.teamwork) { team = teamworkPick(g, pid, c, Array.isArray(o.teamwork) ? o.teamwork : []); if (!team) return false; }
  const plan = planPayment(p, cost, { convoke: d.convoke, spend: { spell: d } }); if (!plan) return false;
  let esc: Card[] = []; if (d.spell?.modes?.escalate && modes && modes.length > 1) { esc = p.battlefield.filter(x => isType(x, 'Creature') && !x.tapped && !plan.srcs.includes(x)).sort((a, b) => power(g, a) - power(g, b)).slice(0, modes.length - 1); if (esc.length < modes.length - 1) return false; }
  const dmDisc = z === 'graveyard' && !!d.gyDiscard && !c.mayPlay; if (dmDisc && !p.hand.some(x => x !== c)) return false;
  payPlan(g, p, plan); c.convokedBy = plan.conv?.map(x => x.uid); if (z === 'exile') emit(g, 'playExile', { player: pid }, c);
  if (dmDisc) { const dc = [...p.hand].sort((a, b) => cmc(def(a)) - cmc(def(b)))[0]; discardCard(g, dc); }
  if (p.flashT?.turn === g.turn && subtypes(d).includes(p.flashT.type)) delete p.flashT;
  for (const x of esc) { x.tapped = true; log(g, `${p.name} taps ${nm(x)} (escalate).`); }
  pathScry(g, pid, plan, d);
  const spent = Math.max(0, cost.generic + (['W', 'U', 'B', 'R', 'G', 'C'] as const).reduce((s, k) => s + (cost[k] ?? 0), 0) + (cost.hyb?.length ?? 0) + (cost.phy?.length ?? 0) - (plan.conv?.length ?? 0) - Math.floor((plan.life ?? 0) / 2));
  c.evoked = !!o.evoke || undefined; c.webSlung = !!webRet || undefined;
  if (webRet) { moveCard(g, webRet, 'hand', { quiet: true }); log(g, `${p.name} returns ${nm(webRet)} to hand (web-slinging).`); }
  if (sneakRet) { c.sneakPaid = true; c.sneakAtk = { attacking: sneakRet.attacking!, atkPw: sneakRet.atkPw }; moveCard(g, sneakRet, 'hand', { quiet: true }); log(g, `${p.name} returns ${nm(sneakRet)} to hand to sneak ${d.name}.`); } else delete c.sneakAtk;
  if (team) { for (const t of team) t.tapped = true; log(g, `${p.name} taps ${team.map(nm).join(', ')} for teamwork.`); } if (plan.life && d.keywords?.includes('compleated')) c.compleat = plan.life;
  const prepSrc = c.prepFor !== undefined ? p.battlefield.find(y => y.uid === c.prepFor) : undefined; if (prepSrc) { prepSrc.prepared = undefined; }
  const fromCmd = p.command.includes(c) && c.prepFor === undefined;
  let extraSac: Card | undefined;
  if (d.extraCost) {
    const ex = d.extraCost;
    if (ex.life) loseLife(g, pid, ex.life);
    if (ex.lifeX && o.x) loseLife(g, pid, o.x);
    if (ex.discard) { const pick = (o.discards ?? []).map(u => p.hand.find(q => q.uid === u)).filter((q): q is Card => !!q && q !== c); const rest = p.hand.filter(q => q !== c && !pick.includes(q)).sort((a, b) => (isType(a, 'Land') ? 0 : cmc(def(a))) - (isType(b, 'Land') ? 0 : cmc(def(b)))); for (const q of [...pick, ...rest].slice(0, ex.discard)) discardCard(g, q); }
    if (ex.sacF) { const cands = p.battlefield.filter(q => matches(g, q, ex.sacF!.f, pid)); const pick = (o.sacs ?? []).map(u => cands.find(q => q.uid === u)).filter((q): q is Card => !!q); const list = [...pick, ...cands.filter(q => !pick.includes(q)).sort((a, b) => valueOf(g, a) - valueOf(g, b))].slice(0, ex.sacF.n); for (const q of list) { q.lki = isType(q, 'Creature') ? { p: power(g, q), t: toughness(g, q) } : undefined; log(g, `${p.name} sacrifices ${nm(q)} (additional cost).`); extraSac ??= q; sacrifice(g, q); } }
  }
  if (orCost && !payInstead) {
    const cands = p.battlefield.filter(q => matches(g, q, orCost.sacF.f, pid)); const pick = (o.sacs ?? []).map(u => cands.find(q => q.uid === u)).filter((q): q is Card => !!q);
    const list = [...pick, ...cands.filter(q => !pick.includes(q)).sort((a, b) => valueOf(g, a) - valueOf(g, b))].slice(0, orCost.sacF.n);
    for (const q of list) { log(g, `${p.name} sacrifices ${nm(q)} (additional cost).`); sacrifice(g, q); }
  }
  for (const z2 of ['hand', 'command', 'graveyard', 'exile', 'library'] as const) p[z2] = p[z2].filter(x => x !== c);
  delete c.mayPlay; delete c.warpAfter; if (o.warp) { c.warpCast = true; g.warpTurn = g.turn; } else delete c.warpCast;
  if (fromCmd) { p.casts[c.id] = (p.casts[c.id] ?? 0) + 1; if (c.id === p.commanderId) p.commanderCasts = p.casts[c.id]; }
  const effects = repFx ?? (d.spell?.modes ? (modes ?? []).flatMap(i => d.spell!.modes!.list[i].effects) : d.spell?.effects ?? []);
  const targets = slots.map((_, i) => (active.includes(i) ? ts[i] : undefined));
  const item: StackItem = { id: g.nextUid++, kind: 'spell', controller: pid, sourceId: c.id, sourceUid: c.uid, card: c, effects, targetSpec: d.spell?.target, target: targets.find(Boolean), targets, tslots: slots, modes, modeDef: d.spell?.modes, x: o.x ?? 0, kicked: !!o.kicked, flashback: fb, rebound: z === 'hand' && !!d.rebound && !prepSrc || undefined, label: d.name, uncounterable: d.uncounterable, evCard: extraSac };
  delete c.onAdv; delete c.foretold; c.kicked = !!o.kicked; c.x = o.x ?? 0; c.teamwork = !!team; item.teamwork = !!team; item.event = { player: pid, spent };
  g.stack.push(item); emitTargeted(g, item);
  const tdesc = targets.filter(Boolean).map(t => describeTarget(g, t)).join(', ');
  log(g, `${p.name} casts ${prepSrc ? 'a copy of ' : ''}${d.name}${o.warp ? ' for its warp cost' : ''}${o.x ? ` (X=${o.x})` : ''}${o.kicked ? ' (kicked)' : ''}${fb ? ' with flashback' : ''}${tdesc ? ` targeting ${tdesc}` : ''}${fromCmd ? ` from the command zone (tax ${2 * (p.casts[c.id] - 1)})` : ''}.`);
  if (p.spells?.turn !== g.turn) p.spells = { turn: g.turn, n: 0, nonc: 0, isv: 0, ins: 0 };
  if (p.spellCols?.turn !== g.turn) p.spellCols = { turn: g.turn, cols: [] }; for (const k of def(c).colors) if (!p.spellCols.cols.includes(k)) p.spellCols.cols.push(k);
  p.spells.n++; if (!d.types.includes('Creature')) p.spells.nonc++; if (d.types.includes('Instant') || d.types.includes('Sorcery') || isTypeOrSub(d, 'Villain')) p.spells.isv++; if (d.types.includes('Instant') || d.types.includes('Sorcery')) p.spells.ins++;
  emit(g, 'cast', { player: pid, mv: cmc(d), spent, nth: { ...p.spells } }, c);
  for (const t of d.triggers ?? []) if (t.on === 'x' && t.ev === 'castSelf') g.pending.push({ controller: pid, sourceId: c.id, sourceUid: c.uid, trig: t, event: { player: pid }, evCard: c });
  if (now) { delete g.castNow; delete c.mayFree; if (g.decision?.kind === 'cast') answerDecision(g, true); return true; }
  acted(g); return true;
}
export interface ActOpts { crew?: number[]; targets?: (Target | undefined)[]; x?: number; sacs?: number[]; discards?: number[]; modes?: number[] }
export function abilitySlots(a: ActAbility): TSlot[] { if (a.modes) return a.modes.list.flatMap(m => m.tslots ?? []); return a.tslots ?? (a.target ? [slotOf(a.target)] : []); }
const abZoneOk = (p: Player, c: Card, a: ActAbility) => a.zone === 'hand' ? p.hand.includes(c) : a.zone === 'graveyard' ? p.graveyard.includes(c) : p.battlefield.includes(c);
const sacCands = (g: Game, p: Player, a: ActAbility, src: Card) => a.sacF ? p.battlefield.filter(x => matches(g, x, a.sacF!.f, p.id, src.uid) && (!a.sacF!.other || x !== src)) : [];
/** Creatures that can crew c (untapped, any summoning sickness), cheapest power first. */
const lvOf = (c: Card, kind: string) => kind === 'class' ? c.classLvl ?? 1 : ctr(c, kind);
export const crewCands = (g: Game, pid: number, c: Card) => g.players[pid].battlefield.filter(x => x !== c && !x.tapped && isType(x, 'Creature')).sort((x, y) => power(g, x) - power(g, y));
export function crewPick(g: Game, pid: number, c: Card, n: number, prefer: number[] = []): Card[] | null {
  const cands = crewCands(g, pid, c); const pick: Card[] = []; let s = 0;
  for (const u of prefer) { const x = cands.find(y => y.uid === u); if (x && !pick.includes(x)) { pick.push(x); s += Math.max(0, power(g, x)); } }
  if (s >= n) return pick;
  // smallest single creature that finishes the job, else accumulate from the weakest
  const rest = cands.filter(x => !pick.includes(x)); const one = rest.find(x => s + power(g, x) >= n); if (one) return [...pick, one];
  for (const x of rest) { if (power(g, x) <= 0) continue; pick.push(x); s += power(g, x); if (s >= n) return pick; }
  return null;
}
const tapCands = (g: Game, p: Player, a: ActAbility, src: Card) => a.tapF ? p.battlefield.filter(x => !x.tapped && matches(g, x, a.tapF!.f, p.id) && !(a.tap && x === src)) : [];
export function canActivate(g: Game, pid: number, c: Card, i: number) {
  const a = def(c).abilities?.[i]; const p = g.players[pid];
  if (!a || c.owner !== pid || !abZoneOk(p, c, a)) return false;
  if (!(hasPriority(g, pid) || (a.manaAb && g.priority === pid && !g.decision && !g.choice && !g.res && g.started))) return false;
  if (((a.sorcery && a.loyalty === undefined) || (a.loyalty !== undefined && !pwInstant(g, c))) && !sorceryTiming(g, pid)) return false;
  if (a.loyalty !== undefined && (c.usedLoyalty === g.turn || (a.loyalty < 0 && ctr(c, 'loyalty') < -a.loyalty))) return false;
  if (a.loyalty !== undefined && !p.battlefield.includes(c)) return false;
  if (a.once && c.usedLoyalty === -g.turn) return false;
  if (a.tap && !canTapNow(c)) return false;
  if (a.untap && !c.tapped) return false;
  if (a.sacF && sacCands(g, p, a, c).length < a.sacF.n) return false;
  if (a.discard && p.hand.filter(x => x !== c).length < a.discard) return false;
  if (a.life && p.life < a.life) return false;
  if (a.remC && ctr(c, a.remC.kind) < a.remC.n) return false;
  if (a.exileGy && (a.exileGy.self ? !p.graveyard.includes(c) : p.graveyard.filter(x => x !== c && matches(g, x, a.exileGy!.f, pid)).length < a.exileGy.n)) return false;
  if (a.tapF && tapCands(g, p, a, c).length < a.tapF.n) return false;
  if (a.crew !== undefined && !crewPick(g, pid, c, a.crew)) return false;
  if (a.station && !crewCands(g, pid, c).length) return false;
  if (a.cond && !condOk(g, pid, a.cond, c)) return false;
  const x: TCtx = { srcId: c.id, srcUid: c.uid };
  if (a.modes ? !modesOk(g, pid, a.modes, x) : !slotsFillable(g, pid, abilitySlots(a), x)) return false;
  return !a.mana || !!planPayment(p, { ...a.mana, x: 0 }, { exclude: a.tap ? c.uid : undefined, wb: a.wb, spend: { act: c } });
}
const valueOf = (g: Game, c: Card) => (isType(c, 'Creature') ? power(g, c) + toughness(g, c) : cmc(def(c))) + (c.token ? -2 : 0) + (isCommander(g, c) ? 20 : 0) + (isType(c, 'Land') ? 3 : 0);
export function activate(g: Game, pid: number, uid: number, i: number, opt?: Target | ActOpts) {
  const o: ActOpts = isTarget(opt) ? { targets: [opt] } : opt ?? {};
  const p = g.players[pid]; const c = [...p.battlefield, ...p.hand, ...p.graveyard].find(x => x.uid === uid); if (!c || !canActivate(g, pid, c, i)) return false;
  const a = def(c).abilities![i]; const slots = abilitySlots(a); const ts = o.targets ?? [];
  let active = slots.map((_, k) => k); let modes: number[] | undefined;
  if (a.modes) { modes = o.modes ?? AI.modes(g, pid, a.modes, c.uid); active = modes.flatMap(k => modeRange(a.modes!, k)); }
  if (!checkTargets(g, pid, slots, ts, active, { srcId: c.id, srcUid: c.uid })) return false;
  // costs
  if (a.mana) { const cost = { ...a.mana, generic: a.mana.generic + (a.mana.x ?? 0) * (o.x ?? 0) + wardCost(g, pid, ts) + merfolkTax(g, pid, ts, 'taxAct'), x: 0 }; if (!pay(g, p, cost, { exclude: a.tap ? c.uid : undefined, wb: a.wb, spend: { act: c } })) return false; }
  else if ((wardCost(g, pid, ts) || merfolkTax(g, pid, ts, 'taxAct')) && !pay(g, p, { generic: wardCost(g, pid, ts) + merfolkTax(g, pid, ts, 'taxAct') }, { exclude: a.tap ? c.uid : undefined, spend: { act: c } })) return false;
  const lki = isType(c, 'Creature') && p.battlefield.includes(c) ? { p: power(g, c), t: toughness(g, c) } : undefined;
  if (a.tap) c.tapped = true;
  if (a.untap) c.tapped = false;
  if (a.life) loseLife(g, pid, a.life);
  if (a.remC) addCounters(g, c, a.remC.kind, -a.remC.n);
  if (a.loyX) { const L = ctr(c, 'loyalty'); o.x = Math.max(0, Math.min(L, o.x ?? (L > 1 ? L - 1 : L))); }
  if (a.loyalty !== undefined) { addCounters(g, c, 'loyalty', a.loyX ? -(o.x ?? 0) : a.loyalty); c.usedLoyalty = g.turn; }
  if (a.once) c.usedLoyalty = -g.turn;
  if (a.station) { const cs = crewCands(g, pid, c); const x = cs.find(y => y.uid === o.crew?.[0]) ?? cs[cs.length - 1]; x.tapped = true; o.x = Math.max(0, power(g, x)); log(g, `${p.name} taps ${nm(x)} to station ${nm(c)} (${o.x}).`); }
  if (a.crew !== undefined) { const cs = crewPick(g, pid, c, a.crew, o.crew)!; for (const x of cs) x.tapped = true; log(g, `${p.name} crews ${nm(c)} with ${cs.map(nm).join(', ')}.`); }
  if (a.tapF) { const cs = tapCands(g, p, a, c).sort((x, y) => power(g, x) - power(g, y)).slice(0, a.tapF.n); for (const x of cs) x.tapped = true; }
  if (a.discard) { const pick = (o.discards ?? []).map(u => p.hand.find(x => x.uid === u)).filter((x): x is Card => !!x && x !== c); const rest = p.hand.filter(x => x !== c && !pick.includes(x)).sort((x, y) => (isType(x, 'Land') ? 0 : cmc(def(x))) - (isType(y, 'Land') ? 0 : cmc(def(y)))); for (const x of [...pick, ...rest].slice(0, a.discard)) discardCard(g, x); }
  if (a.exileGy) { const cs = a.exileGy.self ? [c] : p.graveyard.filter(x => x !== c && matches(g, x, a.exileGy!.f, pid)).slice(0, a.exileGy.n); for (const x of cs) { p.graveyard = p.graveyard.filter(y => y !== x); p.exile.push(x); } }
  if (a.zone === 'hand') { p.hand = p.hand.filter(x => x !== c); p.graveyard.push(c); c.discarded = g.turn; p.discN = p.discT === g.turn ? (p.discN ?? 0) + 1 : 1; p.discT = g.turn; log(g, `${p.name} discards ${nm(c)} (${a.label.split(':')[0]}).`); emit(g, 'discard', { player: pid }, c); if (/cycling/i.test(a.label)) emit(g, 'cycled', { player: pid }, c); }
  let sacked: Card[] = [];
  if (a.sacF) { const cands = sacCands(g, p, a, c); const pick = (o.sacs ?? []).map(u => cands.find(x => x.uid === u)).filter((x): x is Card => !!x); sacked = [...pick, ...cands.filter(x => !pick.includes(x)).sort((x, y) => valueOf(g, x) - valueOf(g, y))].slice(0, a.sacF.n); }
  const label = `${nm(c)}: ${a.label}`;
  const item: StackItem = { id: g.nextUid++, kind: 'ability', controller: pid, sourceId: c.id, sourceUid: c.uid, effects: modes ? modes.flatMap(k => a.modes!.list[k].effects) : a.effects, targetSpec: a.target, targets: slots.map((_, k) => (active.includes(k) ? ts[k] : undefined)), tslots: slots, modes, x: o.x ?? 0, label, srcLki: lki, evCard: sacked[0] };
  item.target = item.targets!.find(Boolean);
  log(g, `${p.name} activates ${label}${item.targets!.some(Boolean) ? ` → ${item.targets!.filter(Boolean).map(t => describeTarget(g, t)).join(', ')}` : ''}.`);
  for (const s of sacked) { item.srcLki ??= undefined; s.lki = { p: power(g, s), t: toughness(g, s) }; log(g, `${p.name} sacrifices ${nm(s)}.`); sacrifice(g, s); }
  if (a.sac) { log(g, `${p.name} sacrifices ${nm(c)}.`); sacrifice(g, c); }
  if (a.exileSelf && p.battlefield.includes(c)) exileCard(g, c);
  if (a.manaAb) { g.res = { item, i: 0, ans: {}, chosen: [], created: [], mana: true }; continueRes(g); if (g.winner === null && !g.decision) { /* mana abilities don't pass priority */ } return true; }
  g.stack.push(item); emitTargeted(g, item);
  acted(g); return true;
}

// ---------------- triggers ----------------
function trigMatches(g: Game, src: Card, t: TriggerDef, type: string, ev: GameEvent, subj?: Card): boolean {
  const me = ctl(src); CT_SRC = src;
  if (t.on === 'x') {
    const evOk = t.ev === type || (t.ev === 'damagePlayer' && type === 'combatDamagePlayer') || (t.ev === 'ltb' && type === 'dies');
    if (!evOk) return false;
    if (t.ev === 'ltb' && type === 'dies') return false; // ltb is emitted separately for every departure
    if (t.ev === 'attackPlayer') return ev.player === me && attackers(g).some(a => a.attacking === ev.vs && matches(g, a, t.f, me, src.uid));
    switch (t.subj) {
      case 'self': if (!subj || subj.uid !== src.uid) return false; break;
      case 'attached': if (!subj || src.attachedTo !== subj.uid) return false; break;
      case 'other': if (!subj || subj.uid === src.uid || !matches(g, subj, t.f, me, src.uid)) return false; break;
      case 'any': if (!subj || !matches(g, subj, t.f, me, -1)) return false; break;
    }
    if (t.pl === 'you' && ev.player !== me) return false;
    if (t.pl === 'opp' && (ev.player === undefined || ev.player === me)) return false;
    if (t.kindF && ev.kind !== t.kindF) return false;
    if (t.zoneFrom && ev.from !== t.zoneFrom) return false;
    if (t.filter === 'noncreature' && (!subj || isType(subj, 'Creature'))) return false;
    if (t.filter === 'instantSorcery' && (!subj || isPermanentCard(def(subj)))) return false;
    if (t.filter === 'nonland' && (!subj || isType(subj, 'Land'))) return false;
    if (t.filter === 'commander' && (!subj || !g.players.some(p => p.commanderIds.includes(subj.id)))) return false;
    if (t.nth && (t.nth.k === 'draw' ? ev.amount !== t.nth.n : ev.nth?.[t.nth.k] !== t.nth.n)) return false;
    if (t.once && src.usedLoyalty === -1000 - g.turn) return false;
    if (t.ifc && !condOk(g, me, t.ifc, src, ev, subj)) return false;
    return true;
  }
  switch (t.on) {
    case 'etb': case 'dies': case 'attacks': case 'combatDamagePlayer': return t.on === type && subj === src;
    case 'damageOpponent': return type === 'combatDamagePlayer' && subj === src && ev.player !== me;
    case 'yourCreatureDies': return type === 'dies' && !!subj && subj.owner === me && isType(subj, 'Creature');
    case 'creatureAttacksYou': return type === 'attacks' && ev.player === me;
    case 'upkeep': case 'endStep': return t.on === type && ev.player === me && legacyCond(g, me, t.cond);
    case 'youCast': return type === 'cast' && ev.player === me && (t.filter !== 'instantSorcery' || !isPermanentCard(def(subj!)));
    case 'anyCastNoncreature': return type === 'cast' && !isType(subj!, 'Creature');
    default: return false;
  }
}
function legacyCond(g: Game, pid: number, cond?: string) {
  const cs = creatures(g.players[pid]);
  if (cond === 'totalPower8') return cs.reduce((s, c) => s + power(g, c), 0) >= 8;
  if (cond === 'power5') return cs.some(c => power(g, c) >= 5);
  return true;
}
export const ctlCommander = (g: Game, pid: number) => g.players.some(q => q.battlefield.some(c => isCommander(g, c) && ctl(c) === pid));
export function condOk(g: Game, pid: number, c: Cond, src?: Card, ev?: GameEvent, subj?: Card, ctx?: ResCtx): boolean {
  const p = g.players[pid];
  switch (c.k) {
    case 'cmdrAttacking': return p.battlefield.some(x => x.attacking !== undefined && isCommander(g, x) && x.owner === pid);
    case 'evByYou': return ev?.by === pid;
    case 'attackedLastTurn': return opponents(g, pid).some(q => !!q.atkDefs?.defs.includes(pid));
    case 'atkMonarch': { const a = subj ?? src; return a?.attacking !== undefined && a.attacking === g.monarch; }
    case 'atkMoreLife': return src?.attacking !== undefined && g.players[src.attacking].life > p.life;
    case 'subjAtkMonarchOpp': return subj?.attacking !== undefined && subj.attacking === g.monarch && g.monarch !== pid;
    case 'evAtkMonarch': return subj?.attacking !== undefined && subj.attacking === g.monarch;
    case 'yourTurnPreAtk': return g.active === pid && ['upkeep', 'draw', 'main1', 'beginCombat'].includes(g.step) && !g.players[pid].battlefield.some(x => x.attacking !== undefined);
    case 'srcDamagedEv': return !!src && subj?.dmgBy?.[src.uid] === g.turn;
    case 'ctrCross': { const s = subj ?? src; if (!s || ev?.kind !== c.kind) return false; const v = ctr(s, c.kind!); return v >= c.n! && v - (ev?.amount ?? 0) < c.n!; }
    case 'discardedThisTurn': return p.discT === g.turn;
    case 'attachedCreature': { const h = src?.attachedTo !== undefined ? findCard(g, src.attachedTo) : undefined; return !!h && isType(h, 'Creature'); }
    case 'refIs': { const r = ctx ? refCards(g, ctx, c.ref)[0] : undefined; return !!r && !!findCard(g, r.uid) && matches(g, r, c.f, pid); }
    case 'enteredThisTurn': return !!src && src.enteredTurn === g.turn;
    case 'libEmpty': return p.library.length === 0;
    case 'not': return !condOk(g, pid, c.c!, src, ev, subj, ctx);
    case 'yourTurn': return g.active === pid;
    case 'ctlCommander': return ctlCommander(g, pid);
    case 'notYourTurn': return g.active !== pid;
    case 'control': return p.battlefield.filter(x => matches(g, x, c.f, pid, c.f?.other ? src?.uid : -1)).length >= (c.n ?? 1);
    case 'controlNo': return !p.battlefield.some(x => matches(g, x, c.f, pid, src?.uid));
    case 'lifeGE': return p.life >= (c.n ?? 0);
    case 'lifeLE': return p.life <= (c.n ?? 0);
    case 'kicked': return !!ctx?.item.kicked || !!src?.kicked;
    case 'handLE': return p.hand.length <= (c.n ?? 0);
    case 'handGE': return p.hand.length >= (c.n ?? 0);
    case 'noCardsHand': return p.hand.length === 0;
    case 'gyGE': case 'cardsInGyGE': return p.graveyard.filter(x => matches(g, x, c.f, pid)).length >= (c.n ?? 0);
    case 'oppControlsMore': return opponents(g, pid).some(o => o.battlefield.filter(x => matches(g, x, c.f, o.id)).length > p.battlefield.filter(x => matches(g, x, c.f, pid)).length);
    case 'attacking': return !!src && src.attacking !== undefined;
    case 'tapped': return !!src && src.tapped;
    case 'monstrous': return !!src?.monstrous;
    case 'prepared': return !!src?.prepared;
    case 'saddled': return src?.saddled === g.turn;
    case 'oppLandsGE': return g.players.filter((q, i) => i !== pid && !q.lost).reduce((s, q) => s + q.battlefield.filter(x => isType(x, 'Land')).length, 0) >= (c.n ?? 0);
    case 'void': return g.leftNL === g.turn || g.warpTurn === g.turn;
    case 'ctrGE': return !!src && lvOf(src, c.kind ?? 'charge') >= (c.n ?? 0);
    case 'ctrEq': return !!src && lvOf(src, c.kind ?? 'charge') === (c.n ?? 0);
    case 'ctrIn': return !!src && lvOf(src, c.kind ?? 'level') >= (c.n ?? 0) && lvOf(src, c.kind ?? 'level') <= (c.max ?? 999);
    case 'incr': { const s = ev?.spent ?? 0; return !!src && (s > power(g, src) || s > toughness(g, src)); }
    case 'spentGE': return ((ctx?.item.event ?? ev)?.spent ?? 0) >= (c.n ?? 0);
    case 'leftYours': return (p.leftTurn ?? -1) === g.turn;
    case 'enduring': return !!p.enduring;
    case 'sneakPaid': return !!src?.sneakPaid;
    case 'webSlung': return !!src?.webSlung;
    case 'teamwork': return !!ctx?.item.teamwork || !!src?.teamwork;
    case 'chosenNonland': return !!ctx?.chosen.some(x => !isType(x, 'Land'));
    case 'evAmt': return ev?.amount === c.n;
    case 'evAmtGE': return (ev?.amount ?? 0) >= (c.n ?? 0);
    case 'enteredUntapped': return !!src && !src.tapped;
    case 'maxSpeed': return (g.players[pid].speed ?? 0) >= 4;
    case 'untapped': return !!src && !src.tapped;
    case 'evCtlYou': return !!subj && ctl(subj) === pid;
    case 'evCtlOpp': return !!subj && ctl(subj) !== pid;
    case 'evIs': return !!subj && matches(g, subj, c.f, pid);
    case 'xGE': return (ctx?.item.x ?? 0) >= (c.n ?? 0);
    case 'lifeGainedThisTurn': return p.gained >= (c.n ?? 1);
    case 'oppLifeLE': return opponents(g, pid).some(o => o.life <= (c.n ?? 0));
    case 'creatureDiedThisTurn': return g.died > 0;
    case 'oppsGE': return opponents(g, pid).length >= (c.n ?? 2);
    case 'castNoncThisTurn': return p.spells?.turn === g.turn && p.spells.nonc > 0;
    case 'oppCastThisTurn': return opponents(g, pid).some(o => o.spells?.turn === g.turn && o.spells.n > 0);
    case 'monarch': return g.monarch === pid;
    case 'noMonarch': return g.monarch === undefined || !!g.players[g.monarch]?.lost;
    case 'handHas': return p.hand.some(x => x !== src && matches(g, x, c.f, pid));
    case 'wasCast': return !!src?.wasCast;
    case 'yourUpkeep': return g.active === pid && g.step === 'upkeep';
    case 'atkMeGE': return attackers(g).filter(a => a.attacking === pid).length >= (c.n ?? 2);
    case 'otherLandsLE': return p.battlefield.filter(x => x !== src && isType(x, 'Land')).length <= (c.n ?? 0);
    case 'descended': return p.graveyard.some(x => isPermanentCard(def(x)));
    default: return true;
  }
}
const MELEE: TriggerDef = { on: '_melee', label: 'melee', effects: [{ op: 'melee' }] };
const PROWESS: TriggerDef = { on: '_prowess', label: 'prowess +1/+1', effects: [{ op: 'pumpSelf', n: 1, m: 1 }] };
/** Collect triggered abilities for an event. `subj` is the card the event is about (it may already have left the battlefield). */
const _rid = new WeakMap<object, number>(); let _ridN = 0; const resId = (o: object) => { let v = _rid.get(o); if (v === undefined) _rid.set(o, v = ++_ridN); return v; };
/** You may cast spells as though they had flash (Quicksilver while tapped; Captain Mar-Vell once an opponent has cast a spell this turn). */
function anyFlash(g: Game, pid: number): boolean {
  return g.players[pid].battlefield.some(c => def(c).statics?.some(s => (s.k === 'flashIfTapped' && c.tapped) || (s.k === 'flashIfOppCast' && opponents(g, pid).some(o => o.spells?.turn === g.turn && o.spells.n > 0))));
}
export function emit(g: Game, type: string, ev: GameEvent, subj?: Card) {
  const pend0 = g.pending.length;
  if (type === 'cast' && g.nextIS && subj && (isType(subj, 'Instant') || isType(subj, 'Sorcery'))) for (const n of [...g.nextIS]) if (n.pid === ev.player && n.turn === g.turn) { g.nextIS = g.nextIS.filter(x => x !== n); g.pending.push({ controller: n.pid, sourceId: n.sourceId, sourceUid: n.sourceUid, trig: { on: 'x', label: 'copy that spell', effects: [{ op: 'script', kind: 'copySpell' }] }, event: { ...ev }, evCard: subj }); }
  const sources = liveSources(g);
  if (subj && !sources.includes(subj) && (type === 'dies' || type === 'ltb' || type === 'sacrificed' || type === 'cycled')) sources.push(subj); // leaves-the-battlefield look-back
  const gyS = new Set<Card>(); for (const p of g.players) for (const c of p.graveyard) if (def(c).triggers?.some(t => t.gy)) { gyS.add(c); sources.push(c); }
  for (const src of sources) {
    const trigs = (def(src).triggers ?? []).filter(t => gyS.has(src) ? t.gy : !t.gy);
    if (hasKw(src, 'prowess') && type === 'cast' && ev.player === src.owner && !isType(subj!, 'Creature') && sources.includes(src) && findCard(g, src.uid)) trigs.push(PROWESS);
    if (type === 'attacks' && subj === src && hasKw(src, 'melee')) trigs.push(MELEE);
    for (const t of trigs) {
      if (t.on === '_prowess' || t.on === '_melee' || trigMatches(g, src, t, type, ev, subj)) {
        if (!t.gy && !findCard(g, src.uid) && !isEmblem(src) && !(t.on === 'dies' || (t.on === 'x' && (t.ev === 'dies' || t.ev === 'ltb' || t.ev === 'sacrificed' || t.ev === 'cycled') && t.subj === 'self'))) continue;
        if (t.once) src.usedLoyalty = -1000 - g.turn;
        const bk = t.batch ? (g.res ? `r${resId(g.res.item)}` : `s${g.turn}:${g.step}`) : undefined; if (bk && g.pending.some(q => q.sourceUid === src.uid && q.trig === t && q.bk === bk)) continue;
        const pend = { bk, controller: ctl(src), sourceId: src.id, sourceUid: src.uid, trig: t, event: { ...ev }, evCard: subj, srcLki: src.lki ?? (isType(src, 'Creature') ? { p: power(g, src), t: toughness(g, src) } : undefined) }; g.pending.push(pend);
        if (isType(src, 'Creature') && def(src).legendary && t.on !== '_prowess' && t.on !== '_melee') for (const a of g.players[ctl(src)].battlefield) if (def(a).legendTrigTwice) { g.pending.push({ ...pend, event: { ...ev } }); log(g, `${nm(a)}: ${nm(src)}'s ability triggers an additional time.`); }
      }
    }
  }
  if (type === 'etb' && subj && isType(subj, 'Creature')) for (const pend of g.pending.slice(pend0)) if (pend.sourceUid === subj.uid && pend.evCard === subj) {
    pend.inst = (g.instN = (g.instN ?? 0) + 1);
    for (const src of liveSources(g)) if (def(src).copyOppEtb && ctl(src) !== ctl(subj)) g.pending.push({ controller: ctl(src), sourceId: src.id, sourceUid: src.uid, trig: { on: 'x', label: 'you may copy that ability. you may choose new targets for the copy', effects: [{ op: 'script', kind: 'copyTrigMay', n: pend.inst }] }, event: { player: ctl(src) }, evCard: subj });
  }
  if (subj && g.watch) for (const w of g.watch) if (w.ev === type && w.uid === subj.uid && !g.players[w.controller].lost) g.pending.push({ controller: w.controller, sourceId: w.sourceId, sourceUid: w.sourceUid, trig: { on: 'x', label: w.label, effects: w.effects }, event: { ...ev }, evCard: subj });
}
export const trigSlots = (t: TriggerDef): TSlot[] => (t.modes ? t.modes.list.flatMap(m => m.tslots ?? []) : t.tslots ?? (t.target ? [slotOf(t.target)] : []));
/** Put pending triggers on the stack in APNAP order. Human-controlled triggers needing targets/modes wait for a choice. */
export function flushTriggers(g: Game) {
  if (g.choice || g.decision || g.res || g.winner !== null) return;
  capUntap(g);
  const N = g.players.length;
  g.pending.sort((a, b) => ((a.controller - g.active + N) % N) - ((b.controller - g.active + N) % N));
  if (!g.ordered) {
    const byP = new Map<number, Pending[]>(); for (const p of g.pending) if (g.players[p.controller].human) byP.set(p.controller, [...(byP.get(p.controller) ?? []), p]);
    for (const [pid, items] of byP) if (items.length >= 2 && new Set(items.map(i => i.sourceUid + i.trig.label)).size > 1) {
      g.decision = { key: 'order', pid, kind: 'order', items, text: 'Several of your abilities triggered at once. Choose the order they resolve in.' }; return;
    }
  }
  g.ordered = false;
  while (g.pending.length) {
    const p = g.pending.shift()!; if (g.players[p.controller].lost) continue;
    const t = p.trig; const src = findCard(g, p.sourceUid);
    if (t.ifc && !condOk(g, p.controller, t.ifc, src, p.event, p.evCard)) continue;
    const slots = trigSlots(t); const x: TCtx = { srcId: p.sourceId, srcUid: p.sourceUid };
    if (t.modes) {
      if (!modesOk(g, p.controller, t.modes, x)) { log(g, `${CARDS[p.sourceId].name}'s trigger has no legal mode.`); continue; }
      if (g.players[p.controller].human) { g.choice = { ...p, needModes: true }; return; }
      const modes = AI.modes(g, p.controller, t.modes, p.sourceUid); const active = modes.flatMap(i => modeRange(t.modes!, i));
      const ts = active.length ? AI.targets(g, p.controller, active.map(i => slots[i]), modes.flatMap(i => t.modes!.list[i].effects), true, p.sourceUid) : [];
      if (ts === null) continue;
      const full: (Target | undefined)[] = slots.map(() => undefined); active.forEach((i, k) => (full[i] = ts[k]));
      pushTrigger(g, p, full, modes); continue;
    }
    if (slots.length) {
      if (!slotsFillable(g, p.controller, slots, x)) { log(g, `${CARDS[p.sourceId].name}'s trigger has no legal target.`); continue; }
      if (g.players[p.controller].human) { g.choice = p; return; }
      let ts: (Target | undefined)[] | null = AI.targets(g, p.controller, slots, t.effects, true, p.sourceUid);
      if ((!ts || !ts.some(Boolean)) && t.target && slots.length === 1) { const one = autoTarget(g, p.controller, t.target, t.effects, true); ts = one ? [one] : ts; }
      if (!ts) continue;
      pushTrigger(g, p, ts);
    } else pushTrigger(g, p);
  }
}
function pushTrigger(g: Game, p: Pending, ts?: (Target | undefined)[], modes?: number[]) {
  const t = p.trig; const label = `${CARDS[p.sourceId].name}: ${t.label}`;
  const effects = modes && t.modes ? modes.flatMap(i => t.modes!.list[i].effects) : t.effects;
  const item: StackItem = { id: g.nextUid++, kind: 'trigger', controller: p.controller, sourceId: p.sourceId, sourceUid: p.sourceUid, effects, targetSpec: t.target, targets: ts, tslots: trigSlots(t), target: ts?.find(Boolean), label, event: p.event, evCard: p.evCard, ifc: t.ifc, modes, chapter: t.ev === 'chapter' || undefined, srcLki: p.srcLki, inst: p.inst };
  // ward: a targeted opponent permanent with ward counters the trigger unless its controller pays
  const w = wardCost(g, p.controller, ts ?? []);
  if (w && !pay(g, g.players[p.controller], { generic: w })) { log(g, `⚡ ${label} is countered by ward.`); return; }
  g.stack.push(item); emitTargeted(g, item);
  log(g, `⚡ Trigger: ${label.replace(/\.$/, "")}${item.targets?.some(Boolean) ? ` → ${item.targets.filter(Boolean).map(x => describeTarget(g, x)).join(', ')}` : ''}.`);
}
/** Human picks targets (and modes) for a pending triggered ability. */
export function chooseTriggerTargets(g: Game, ts: (Target | undefined)[], modes?: number[]) {
  const p = g.choice; if (!p) return false; const t = p.trig; const slots = trigSlots(t);
  let active = slots.map((_, i) => i);
  if (t.modes) { if (!modes || modes.length < t.modes.min || modes.length > t.modes.max) return false; active = modes.flatMap(i => modeRange(t.modes!, i)); }
  if (!checkTargets(g, p.controller, slots, ts, active, { srcId: p.sourceId, srcUid: p.sourceUid })) return false;
  g.choice = null; pushTrigger(g, p, slots.map((_, i) => (active.includes(i) ? ts[i] : undefined)), modes); flushTriggers(g); return true;
}
export function chooseTriggerTarget(g: Game, t: Target) { return chooseTriggerTargets(g, [t]); }

// ---------------- zones ----------------
function leave(g: Game, c: Card) {
  const o = g.players[c.owner];
  if (isType(c, 'Creature')) c.lki = { p: power(g, c), t: toughness(g, c) };
  o.battlefield = o.battlefield.filter(x => x !== c);
  c.lastCtrs = c.counters ? { ...c.counters } : undefined;
  Object.assign(c, { tapped: false, damage: 0, pp: 0, pt: 0, deathtouched: false, sick: false, kw: undefined, pkw: undefined, monstrous: undefined, counters: undefined, regen: 0, sp: 0, st: 0, skw: undefined });
  delete c.attacking; delete c.blocking; delete c.blockedBy; delete c.attachedTo; delete c.goad; delete c.sneakPaid; delete c.webSlung; delete c.evoked; delete c.earthbent; delete c.teamwork; delete c.classLvl; delete c.saddled; delete c.usedLoyalty; delete c.atkPw; delete c.anim; delete c.nx; delete c.floodIsle; delete c.freeze; delete c.loseSrc;
  if (c.pair !== undefined) { const o = findCard(g, c.pair); if (o && o.pair === c.uid) delete o.pair; delete c.pair; }
  for (const q of g.players) for (const x of q.battlefield) if (x.loseSrc === c.uid) delete x.loseSrc;
  if (g.ces) g.ces = g.ces.filter(x => x.uid !== c.uid); if (g.watch) g.watch = g.watch.filter(w => w.uid !== c.uid || w.ev === 'dies'); delete c.wasCast; offBfEff(c);
  if (c.realOwner !== undefined) { c.owner = c.realOwner; delete c.realOwner; }
}
/** Move a permanent to another player's battlefield (control change; no zone change triggers). */
export function changeControl(g: Game, c: Card, to: number) {
  const from = g.players[c.owner]; if (c.owner === to || !from.battlefield.includes(c)) return;
  from.battlefield = from.battlefield.filter(x => x !== c); delete c.attacking; delete c.blocking; delete c.blockedBy; delete c.atkPw;
  if (c.realOwner === undefined) c.realOwner = c.owner; c.owner = to; if (c.realOwner === to) delete c.realOwner; c.sick = true;
  g.players[to].battlefield.push(c); log(g, `${g.players[to].name} gains control of ${nm(c)}.`); layer(g);
}
/** Move a card from wherever it is to another zone. Tokens cease to exist off the battlefield; commanders go to the command zone instead of graveyard/exile. */
let _cpN = 0;
/** c becomes a copy of t (copiable values = t's printed/copied card). Reverts when it leaves the battlefield (or at cleanup with eot). */
export function becomeCopy(g: Game, c: Card, t: Card, o: { name?: string; nonlegendary?: boolean; eot?: boolean } = {}) {
  const base = CARDS[t.id]; if (!base) return; const d: CardDef = { ...base, id: `${t.id}#cp${++_cpN}`, name: o.name ?? base.name, legendary: o.nonlegendary ? false : base.legendary };
  CARDS[d.id] = d; c.origId ??= c.id; c.id = d.id; if (o.eot) c.copyEot = g.turn; layer(g); log(g, `${o.name ?? nm(t)} becomes a copy of ${base.name}${o.eot ? ' until end of turn' : ''}.`);
}
export function moveCard(g: Game, c: Card, dest: 'hand' | 'graveyard' | 'exile' | 'top' | 'bottom' | 'battlefield', o: { tapped?: boolean; ctl?: number; quiet?: boolean; why?: string; transformed?: boolean } = {}) {
  const l = locate(g, c.uid); const wasBf = l?.zone === 'battlefield';
  if (wasBf && c.unearthed) { delete c.unearthed; if (dest !== 'exile') { dest = 'exile'; log(g, `${nm(c)} is exiled instead (unearth).`); } }
  if (wasBf && !isType(c, 'Land')) g.leftNL = g.turn; if (wasBf) g.players[ctl(c)].leftTurn = g.turn;
  const eb = wasBf && !!c.earthbent;
  if (wasBf) leave(g, c); else if (l) (l.p[l.zone] as Card[]).splice(l.p[l.zone].indexOf(c), 1);
  frontFace(c); delete c.onAdv; delete c.foretold; delete c.discarded; if (c.origId) { c.id = c.origId; delete c.origId; delete c.copyEot; }
  if (eb && (dest === 'graveyard' || dest === 'exile') && !c.token) g.pending.push({ controller: c.owner, sourceId: c.id, sourceUid: c.uid, trig: { on: 'x', label: `return ${nm(c)} to the battlefield tapped (earthbend)`, effects: [{ op: 'earthReturn', n: c.uid }] }, event: { player: c.owner } });
  const owner = g.players[c.owner];
  if (wasBf && c.linkRet !== undefined) { g.pending.push({ controller: c.owner, sourceId: c.id, sourceUid: c.uid, trig: { on: 'x', label: 'put the exiled card into your hand', effects: [{ op: 'linkHand', n: c.linkRet }] }, event: { player: c.owner } }); delete c.linkRet; }
  if (dest === 'battlefield') { if (o.transformed) flipFace(c); enter(g, c, o.ctl ?? c.owner, { tapped: o.tapped }); return; }
  if (c.token) { if (wasBf) emit(g, 'ltb', { player: c.owner, from: 'battlefield' }, c); return; }
  if (isCommander(g, c) && (dest === 'graveyard' || dest === 'exile')) { owner.command.push(c); if (!o.quiet) log(g, `${nm(c)} goes to the command zone.`); }
  else if (dest === 'top') owner.library.push(c); else if (dest === 'bottom') owner.library.unshift(c);
  else owner[dest].push(c);
  if (wasBf) emit(g, 'ltb', { player: c.owner, from: 'battlefield' }, c);
}
export function enter(g: Game, c: Card, pid: number, o: { tapped?: boolean; attachTo?: number } = {}) {
  delete c.eff; delete c.faceDown; c.ts = nextTs(g); const d = def(c); const p = g.players[pid];
  Object.assign(c, { tapped: !!o.tapped || !!d.etbTapped, damage: 0, pp: 0, pt: 0, sick: true, counters: undefined, kw: undefined }); if (c.susHaste) { c.kw = ['haste']; delete c.susHaste; } if (c.tapped) c.preTapT = g.turn; delete c.suspended; delete c.exBy; if (pid !== c.owner && c.realOwner === undefined && !c.token) c.realOwner = c.owner; c.owner = pid; if (c.realOwner === pid) delete c.realOwner; c.enteredTurn = g.turn;
  if (o.attachTo !== undefined) c.attachedTo = o.attachTo;
  c.prepared = !!(d.etbPrepared && CARDS[c.id]?.prepDef) || undefined;
  if (d.loyalty) { c.counters = { loyalty: Math.max(1, d.loyalty - (c.compleat ?? 0)) }; delete c.compleat; }
  if (d.etbCounters) { const n = typeof d.etbCounters.n === 'string' && d.etbCounters.n === 'X' ? c.x ?? 0 : amtStatic(g, d.etbCounters.n, c); if (n > 0) (c.counters ??= {})[d.etbCounters.kind] = n; }
  if (d.etbTappedUnless && !condOk(g, pid, d.etbTappedUnless, c)) c.tapped = true;
  for (const q of p.battlefield) for (const st of def(q).statics ?? []) if (st.k === 'etbExtra' && matches(g, c, st.f, pid, q.uid)) { const k = st.kws?.[0] ?? '+1/+1'; (c.counters ??= {})[k] = (c.counters[k] ?? 0) + (st.n ?? 1); }
  if (d.chooseType) { const opts = typeOptions(g, pid); setChosen(g, c, aiType(g, pid, opts.length ? opts : ['Human'])); if (p.human && g.started && !g.decision) g.decision = { key: `ctype:${c.uid}`, pid, kind: 'ctype', options: opts.length ? opts : ['Human'], text: `${d.name}: choose a creature type.`, src: c.id } as Decision; }
  if (d.shock && !c.tapped) {
    if (p.human && g.started) { c.tapped = true; g.decision = { key: `shock:${c.uid}`, pid, kind: 'may', text: `Pay ${d.shock} life so ${d.name} enters untapped?`, src: c.id } as Decision; }
    else if (!p.human && p.life > 12 && g.active === pid) loseLife(g, pid, d.shock); else c.tapped = true;
  }
  p.battlefield.push(c); if (!c.token) log(g, `${nm(c)} enters the battlefield under ${p.name}'s control${c.tapped ? ' tapped' : ''}${c.chosenType && d.chooseType && !(p.human && g.decision?.key === `ctype:${c.uid}`) ? ` (chosen type: ${c.chosenType})` : ''}.`);
  layer(g);
  emit(g, 'etb', { player: pid }, c);
  if (d.saga) addCounters(g, c, 'lore', 1);
  if (c.evoked) { delete c.evoked; g.pending.push({ controller: pid, sourceId: c.id, sourceUid: c.uid, trig: { on: 'x', label: 'evoke: sacrifice it', effects: [{ op: 'sacThis' }] }, event: { player: pid } }); }
  if (c.token) emit(g, 'tokenCreated', { player: pid }, c);
}
function toGraveyardOrCommand(g: Game, c: Card) { frontFace(c); const o = g.players[c.owner]; if (isCommander(g, c)) { o.command.push(c); log(g, `${nm(c)} goes to the command zone.`); } else o.graveyard.push(c); }
export function exileCard(g: Game, c: Card) { const cmd = isCommander(g, c); moveCard(g, c, 'exile', { quiet: true }); log(g, `${nm(c)} is exiled${cmd ? ' → command zone' : ''}.`); }
export function destroy(g: Game, c: Card, why = 'dies') {
  const o = g.players[c.owner]; if (!o.battlefield.includes(c)) return;
  if (why !== 'sacrifice') {
    if (hasKw(c, 'indestructible')) { log(g, `${nm(c)} is indestructible.`); return; }
    if (c.regen) { c.regen--; c.tapped = true; c.damage = 0; c.deathtouched = false; delete c.attacking; delete c.blocking; log(g, `${nm(c)} regenerates.`); return; }
  }
  if (ctr(c, 'finality') > 0) { log(g, `${nm(c)} has a finality counter: exiled instead.`); exileCard(g, c); return; }
  const cmd = isCommander(g, c); const wasCreature = isType(c, 'Creature');
  if (c.unearthed) { moveCard(g, c, 'graveyard', { quiet: true }); if (why === 'sacrifice') emit(g, 'sacrificed', { player: c.owner }, c); return; }
  moveCard(g, c, 'graveyard', { quiet: true });
  if (cmd) log(g, `${nm(c)} ${why === 'sacrifice' ? 'is sacrificed' : 'dies'} → command zone.`); else if (why !== 'sacrifice') log(g, `${nm(c)} ${wasCreature ? 'dies' : 'is put into the graveyard'}.`);
  if (wasCreature) g.died++;
  emit(g, 'dies', { player: c.owner }, c);
  if (why === 'sacrifice') emit(g, 'sacrificed', { player: c.owner }, c);
}
export function sacrifice(g: Game, c: Card) { if (c.noSacT !== undefined && c.noSacT >= g.turn) { log(g, `${nm(c)} can't be sacrificed.`); return; } destroy(g, c, 'sacrifice'); }
export function discardCard(g: Game, c: Card) { const p = g.players[c.owner]; p.hand = p.hand.filter(x => x !== c); p.graveyard.push(c); c.discarded = g.turn; p.discN = p.discT === g.turn ? (p.discN ?? 0) + 1 : 1; p.discT = g.turn; log(g, `${p.name} discards ${nm(c)}.`); emit(g, 'discard', { player: c.owner }, c); }
export function gainLife(g: Game, pid: number, n: number) { if (n <= 0) return; const p = g.players[pid]; p.life += n; p.gained += n; emit(g, 'gainLife', { player: pid, amount: n }); }
export function loseLife(g: Game, pid: number, n: number) { if (n <= 0) return; const p = g.players[pid]; p.life -= n; p.lostLife += n;
  { const A = g.players[g.active]; if (pid !== g.active && A.speed && A.speed < 4 && A.speedTurn !== g.turn) { A.speed++; A.speedTurn = g.turn; log(g, `${A.name}'s speed increases to ${A.speed}${A.speed === 4 ? ' (max speed)' : ''}.`); } } emit(g, 'loseLife', { player: pid, amount: n }); }
export function addCounters(g: Game, c: Card, kind: string, n: number) {
  if (!n) return; const cs = (c.counters ??= {}); const old = cs[kind] ?? 0; cs[kind] = Math.max(0, old + n);
  if (n > 0 && findCard(g, c.uid)) emit(g, 'counterPut', { player: ctl(c), kind, amount: n, by: g.res ? g.res.item.controller : undefined }, c);
  if (n > 0 && kind === 'lore' && def(c).saga && findCard(g, c.uid)) for (let k = old + 1; k <= old + n; k++) emit(g, 'chapter', { player: ctl(c), amount: k }, c);
}
const COLOR_WORD: Record<string, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };
/** Deal damage from a source to a creature/planeswalker or a player (handles protection, deathtouch, lifelink, planeswalker loyalty, commander damage). */
export function dealDamage(g: Game, srcId: string, srcCard: Card | undefined, to: { card?: Card; player?: number }, n: number, combat = false) {
  if (n <= 0) return 0; const sd = CARDS[srcId]; const srcCtl = srcCard ? ctl(srcCard) : undefined;
  if (g.redirect?.turn === g.turn) { const r = findCard(g, g.redirect.uid); const tc = to.card ? ctl(to.card) : to.player; if (r && tc === g.redirect.pid && to.card !== r) { log(g, `The damage is dealt to ${nm(r)} instead.`); to = { card: r }; } }
  { // damage replacement / prevention statics (Thor, Panther Habit, Heart-Shaped Herb)
    const tgtCtl = to.card ? ctl(to.card) : to.player;
    for (const s0 of liveSources(g)) for (const st of def(s0).statics ?? []) {
      if (st.k === 'dmgPlus1' && srcCard && srcCard !== s0 && srcCtl === ctl(s0) && tgtCtl !== undefined && tgtCtl !== ctl(s0) && findCard(g, s0.uid)) n += 1;
    }
    for (const s0 of liveSources(g)) for (const st of def(s0).statics ?? []) {
      if (st.k === 'preventOppToYou' && to.player !== undefined && to.player === ctl(s0) && srcCtl !== undefined && srcCtl !== ctl(s0) && findCard(g, s0.uid)) { n = Math.max(0, n - (st.n ?? 1)); if (!n) { log(g, `${nm(s0)} prevents the damage.`); return 0; } }
      if (st.k === 'preventToAttachedCtr' && to.card && s0.attachedTo === to.card.uid && findCard(g, s0.uid)) { log(g, `${nm(s0)} prevents ${n} damage to ${nm(to.card)} and puts ${n} +1/+1 counter${n > 1 ? 's' : ''} on it.`); addCounters(g, to.card, '+1/+1', n); return 0; }
    }
  }
  if (to.card) {
    const c = to.card; if (!findCard(g, c.uid)) return 0;
    if (c.anim?.prevent) { log(g, `Damage to ${nm(c)} is prevented.`); return 0; }
    if (sd.colors.some(k => hasKw(c, `protection from ${COLOR_WORD[k]}`))) { log(g, `${nm(c)} has protection: damage prevented.`); return 0; }
    if (isType(c, 'Planeswalker') && !isType(c, 'Creature')) addCounters(g, c, 'loyalty', -n);
    else { c.damage += n; if (srcCard && hasKw(srcCard, 'deathtouch')) c.deathtouched = true; }
    if (srcCard) (c.dmgBy ??= {})[srcCard.uid] = g.turn; { const first = c.dmgT !== g.turn; c.dmgT = g.turn; emit(g, 'dealtDamage', { player: ctl(c), amount: n, kind: first ? 'first' : undefined }, c); }
    if (!combat) log(g, `${sd.name} deals ${n} damage to ${nm(c)}.`);
  } else if (to.player !== undefined) {
    const v = g.players[to.player]; if (v.lost) return 0;
    v.life -= n; v.lostLife += n;
    if (combat && srcCard && isCommander(g, srcCard)) { const k = cmdKey(g, srcCard); v.cmdDamage[k] = (v.cmdDamage[k] || 0) + n; }
    if (!combat) { log(g, `${sd.name} deals ${n} damage to ${v.name}.`); if (srcCard) emit(g, 'damagePlayer', { player: to.player, amount: n }, srcCard); }
    if (srcCard && srcCtl !== undefined && to.player !== srcCtl) { const mate = srcCard.pair !== undefined ? findCard(g, srcCard.pair) : undefined; const look = [srcCard, mate].find(x => x && def(x).statics?.some(st => st.k === 'soulDraw') && x.pair !== undefined); if (look && (look === srcCard || look.pair === srcCard.uid)) { draw(g, srcCtl, 1); log(g, `${nm(srcCard)} deals damage to an opponent: ${g.players[srcCtl].name} draws a card.`); } }
  }
  if (srcCard && srcCtl !== undefined && hasKw(srcCard, 'lifelink')) gainLife(g, srcCtl, n);
  return n;
}
const TOKEN_PRESETS: Record<string, Partial<CardDef>> = {
  Treasure: { types: ['Artifact'], sub: ['Treasure'], text: 'T, Sacrifice this artifact: Add one mana of any color.', mana: [{ add: ['ANY'], sac: true }] },
  Lander: { types: ['Artifact'], sub: ['Lander'], text: '{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.', abilities: [{ label: 'Search for a basic land', mana: { generic: 2 }, tap: true, sac: true, effects: [{ op: 'search', f: { types: ['Land'], basic: true }, dest: 'battlefield', tapped: true, n: 1 }] }] },
  Heartwood: { types: ['Artifact'], sub: ['Heartwood'], colors: ['R', 'G'], text: '{T}: Add {R} or {G}.', mana: [{ add: ['R|G'] }] },
  Gold: { types: ['Artifact'], sub: ['Gold'], text: 'Sacrifice this artifact: Add one mana of any color.', mana: [{ add: ['ANY'], sac: true }] },
  Food: { types: ['Artifact'], sub: ['Food'], text: '{2}, {T}, Sacrifice this artifact: You gain 3 life.', abilities: [{ label: 'Gain 3 life', mana: { generic: 2 }, tap: true, sac: true, effects: [{ op: 'gain', n: 3, pl: 'you' }] }] },
  Clue: { types: ['Artifact'], sub: ['Clue'], text: '{2}, Sacrifice this artifact: Draw a card.', abilities: [{ label: 'Draw a card', mana: { generic: 2 }, sac: true, effects: [{ op: 'draw', n: 1, pl: 'you' }] }] },
  Blood: { types: ['Artifact'], sub: ['Blood'], text: '{1}, {T}, Discard a card, Sacrifice this artifact: Draw a card.', abilities: [{ label: 'Rummage', mana: { generic: 1 }, tap: true, sac: true, discard: 1, effects: [{ op: 'draw', n: 1, pl: 'you' }] }] },
  Powerstone: { types: ['Artifact'], sub: ['Powerstone'], text: "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.", mana: [{ add: ['C'], only: 'artifact' }] },
  Vibranium: { types: ['Artifact'], sub: ['Vibranium'], keywords: ['indestructible'], text: "Indestructible\n{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.", mana: [{ add: ['C'], only: 'artifact' }] },
  Map: { types: ['Artifact'], sub: ['Map'], text: '{1}, {T}, Sacrifice this artifact: Target creature you control explores.', abilities: [{ label: 'Explore', mana: { generic: 1 }, tap: true, sac: true, sorcery: true, tslots: [{ who: 'perm', f: { types: ['Creature'], ctrl: 'you' } }], effects: [{ op: 'explore', who: 't0' }] }] },
};
export function tokenDef(t: TokenSpec): CardDef {
  const id = (`tok-${t.preset ?? ''}${t.name}-${t.p ?? ''}-${t.t ?? ''}-${t.colors.join('')}-${(t.kws ?? []).join('.')}-${(t.sub ?? []).join('.')}-${t.types.join('.')}` + (t.ext ? '-' + t.ext.text.replace(/[^a-z0-9]+/gi, '').slice(0, 40) : '')).replace(/\s+/g, '_');
  if (!CARDS[id]) {
    const pre = t.preset ? TOKEN_PRESETS[t.preset] : {};
    const sub = t.sub ?? pre.sub ?? [];
    CARDS[id] = { id, name: t.name, types: t.types, sub, cost: { generic: 0 }, colors: t.colors, power: t.p, toughness: t.t, keywords: t.kws?.length ? t.kws : undefined, legendary: t.legendary, text: pre.text ?? (t.kws ?? []).join(', '), typeLine: `Token ${t.legendary ? 'Legendary ' : ''}${t.types.join(' ')}${sub.length ? ' — ' + sub.join(' ') : ''}`, token: true, ...pre, identity: [] } as CardDef;
    CARDS[id].types = t.types; CARDS[id].sub = sub;
    if (t.ext) { const x = t.ext; const D = CARDS[id]; D.text = [(t.kws ?? []).join(', '), x.text].filter(Boolean).join('\n'); if (x.mana) D.mana = x.mana; if (x.abilities) D.abilities = x.abilities; if (x.triggers) D.triggers = x.triggers; if (x.statics) D.statics = x.statics; if (x.keywords?.length) D.keywords = [...(D.keywords ?? []), ...x.keywords]; }
  }
  return CARDS[id];
}
export function createToken(g: Game, pid: number, spec: TokenSpec | string, o: { tapped?: boolean; attackingLike?: Card } = {}): Card {
  let id = typeof spec === 'string' ? spec : tokenDef(spec).id;
  if (CARDS[id]?.types.includes('Creature') && liveSources(g).some(s => ctl(s) === pid && def(s).statics?.some(st => st.k === 'angelTokens'))) id = tokenDef({ name: 'Angel', p: 4, t: 4, colors: ['W'], types: ['Creature'], sub: ['Angel'], kws: ['flying', 'vigilance'] }).id;
  const c: Card = { uid: g.nextUid++, id, owner: pid, tapped: false, sick: true, damage: 0, pp: 0, pt: 0, token: true };
  enter(g, c, pid, { tapped: o.tapped });
  if (o.attackingLike?.attacking !== undefined && isType(c, 'Creature')) { c.attacking = o.attackingLike.attacking; c.blockedBy = []; c.tapped = true; c.preTapT = g.turn; }
  return c;
}

// ---------------- resolution ----------------
const WAIT = { wait: true };
export const costText = (c: Cost) => `${c.x ? '{X}'.repeat(c.x) : ''}${c.generic ? `{${c.generic}}` : ''}${(c.hyb ?? []).map(h => `{${h.replace('|', '/')}}`).join('')}${(['W', 'U', 'B', 'R', 'G', 'C'] as const).map(k => `{${k}}`.repeat(c[k] || 0)).join('')}${(c.phy ?? []).map(k => `{${k}/P}`).join('')}` || '{0}';
function resolveTop(g: Game): boolean {
  const it = g.stack.pop()!;
  const slots = it.tslots ?? (it.targetSpec ? [slotOf(it.targetSpec)] : []);
  const ts = it.targets ?? (it.target ? [it.target] : []);
  if (ts.some(Boolean)) {
    const x: TCtx = { selfStackId: it.id, srcId: it.sourceId, srcUid: it.sourceUid };
    const ok = ts.map((t, i) => !!t && !!slots[i] && validSlot(g, it.controller, { ...slots[i], opt: false }, t, x));
    if (!ok.some(Boolean)) { log(g, `${it.label} fizzles (target is gone).`); if (it.card) spellAway(g, it); return true; }
    it.targets = ts.map((t, i) => (ok[i] ? t : undefined)); it.target = it.targets.find(Boolean);
  }
  if (it.ifc && !condOk(g, it.controller, it.ifc, findCard(g, it.sourceUid), it.event, it.evCard)) { log(g, `${it.label}: condition no longer true, no effect.`); return true; }
  if (it.kind === 'spell' && isPermanentCard(def(it.card!)) && def(it.card!).asEnters && !it.aeDone) { it.aeDone = true; it.effects = [...def(it.card!).asEnters!, { op: 'script', kind: 'enterPerm' }]; }
  else if (it.kind === 'spell' && isPermanentCard(def(it.card!))) {
    const c = it.card!; const d = def(c); c.wasCast = true;
    if (d.aura) { const host = it.target?.card; if (host === undefined) { log(g, `${d.name} has nothing to enchant.`); spellAway(g, it); return true; } enter(g, c, it.controller, { attachTo: host }); }
    else enter(g, c, it.controller, {});
    if (c.sneakAtk) { const sa = c.sneakAtk; delete c.sneakAtk; c.sneakPaid = true; if (isType(c, 'Creature') && g.step !== 'end' && g.step !== 'cleanup' && g.step !== 'main2' && (sa.atkPw === undefined || findCard(g, sa.atkPw)) && !g.players[sa.attacking]?.lost) { c.tapped = true; c.attacking = sa.attacking; if (sa.atkPw !== undefined) c.atkPw = sa.atkPw; c.blockedBy = []; log(g, `${nm(c)} enters tapped and attacking.`); } else c.tapped = true; }
    if (c.warpCast) { delete c.warpCast; (g.delayed ??= []).push({ at: 'endStep', turnAfter: g.step === 'end' || g.step === 'cleanup' ? g.turn : g.turn - 1, controller: it.controller, sourceId: c.id, sourceUid: c.uid, label: `exile ${nm(c)} (warp)`, effects: [{ op: 'warpExile', who: `uid:${c.uid}` }] }); }
    checkState(g); return true;
  }
  log(g, `${it.label.replace(/\.$/, "")} resolves.`);
  g.res = { item: it, i: 0, ans: {}, chosen: [], created: [] };
  return continueRes(g);
}
function spellAway(g: Game, it: StackItem, resolved = false) { if (!it.card) return; if (it.card.prepFor !== undefined || it.card.isCopy) return; // a copy ceases to exist
  if (resolved && it.rebound && !it.flashback) { const c = it.card; frontFace(c); g.players[c.owner].exile.push(c); c.reboundT = g.turn; (g.delayed ??= []).push({ at: 'upkeep', pid: it.controller, turnAfter: g.turn, controller: it.controller, sourceId: c.id, sourceUid: c.uid, label: `Rebound — you may cast ${nm(c)} from exile without paying its mana cost.`, effects: [{ op: 'rebound' }] }); log(g, `${nm(c)} is exiled (rebound).`); return; }
  if (resolved && !it.flashback && def(it.card).adventure) { const c = it.card; frontFace(c); g.players[c.owner].exile.push(c); c.onAdv = true; log(g, `${nm(c)} goes on an adventure (exiled; its creature may be cast later).`); return; }
  frontFace(it.card);
  if (resolved && it.awayTo === 'bottom') { g.players[it.card.owner].library.unshift(it.card); log(g, `${nm(it.card)} is put on the bottom of its owner's library.`); return; }
  if (resolved && it.awayTo === 'exile') { g.players[it.card.owner].exile.push(it.card); log(g, `${nm(it.card)} is exiled.`); return; }
  if (it.card.exileAfter) { delete it.card.exileAfter; g.players[it.card.owner].exile.push(it.card); log(g, `${nm(it.card)} is exiled instead.`); return; }
  if (it.flashback) { g.players[it.card.owner].exile.push(it.card); log(g, `${nm(it.card)} is exiled (flashback).`); } else toGraveyardOrCommand(g, it.card); }
function continueRes(g: Game): boolean {
  const ctx = g.res!;
  try { while (ctx.i < ctx.item.effects.length) { exec(g, ctx, ctx.item.effects[ctx.i], String(ctx.i)); ctx.i++; layer(g); } }
  catch (e) { if (e === WAIT) return false; throw e; }
  g.res = null;
  if (ctx.item.kind === 'spell') spellAway(g, ctx.item, true);
  checkState(g);
  return true;
}
/** Answer the current decision (human). */
export function answerDecision(g: Game, a: unknown) {
  const d = g.decision; if (!d) return false; g.decision = null;
  if (d.kind === 'cast') delete g.castNow;
  if (d.kind === 'order') {
    const order = (a as number[]).map(i => d.items[i]).filter(Boolean); const rest = d.items.filter(x => !order.includes(x));
    const mine = [...order, ...rest].reverse(); // first listed resolves first = goes on the stack last
    const N = g.players.length; const others = g.pending.filter(x => !d.items.includes(x));
    g.pending = [...others, ...mine].sort((x, y) => ((x.controller - g.active + N) % N) - ((y.controller - g.active + N) % N));
    g.ordered = true; flushTriggers(g); return true;
  }
  if (d.key.startsWith('ctype:')) { const c = findCard(g, +d.key.slice(6)); if (c) { setChosen(g, c, String(a)); log(g, `${g.players[d.pid].name} chooses ${c.chosenType} for ${nm(c)}.`); layer(g); } checkState(g); if (!g.res && g.priority !== null) flushTriggers(g); return true; }
  if (d.key.startsWith('shock:')) { const c = findCard(g, +d.key.slice(6)); if (c && a) { loseLife(g, d.pid, def(c).shock ?? 2); c.tapped = false; log(g, `${g.players[d.pid].name} pays ${def(c).shock} life; ${nm(c)} is untapped.`); } checkState(g); if (!g.res && g.priority !== null) flushTriggers(g); return true; }
  const ctx = g.res; if (!ctx) return false;
  ctx.ans[d.key] = a;
  const mana = ctx.mana;
  if (continueRes(g) && !mana && g.winner === null) givePriority(g);
  else if (mana && !g.res) checkState(g);
  return true;
}
type DOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
function ask<T>(g: Game, ctx: ResCtx, key: string, d: DOmit<Decision, 'key'>): T {
  if (key in ctx.ans) return ctx.ans[key] as T;
  const dd = { ...d, key, src: ctx.item.sourceId } as Decision;
  if (!g.players[d.pid].human) { const a = AI.decide(g, dd); ctx.ans[key] = a; return a as T; }
  g.decision = dd; throw WAIT;
}
const srcOf = (g: Game, ctx: ResCtx) => locate(g, ctx.item.sourceUid)?.c;
/** Resolve "mana value X or less" filters against the resolving ability's X. */
const fX = (g: Game, ctx: ResCtx, f: Filter | undefined): Filter | undefined => { if (!f || (!f.mvLEX && !f.mvEqX)) return f; const x = amt(g, ctx, 'X'); return { ...f, mvLEX: undefined, mvEqX: undefined, mvLE: x, ...(f.mvEqX ? { mvGE: x } : {}) }; };
export function refCards(g: Game, ctx: ResCtx, r: Ref | undefined): Card[] {
  if (!r) return [];
  if (typeof r === 'object' && (r.all.mvLEX || r.all.mvEqX)) r = { ...r, all: fX(g, ctx, r.all)! };
  if (typeof r === 'object') {
    const pid = ctx.item.controller;
    if (r.zone === 'graveyard') return g.players.flatMap(p => p.graveyard).filter(c => matches(g, c, r.all, pid));
    return g.players.flatMap(p => p.battlefield).filter(c => matches(g, c, r.all, pid, ctx.item.sourceUid));
  }
  if (r === 'self') { const s = srcOf(g, ctx); return s ? [s] : []; }
  if (r.startsWith('uid:')) { const l = locate(g, +r.slice(4)); return l ? [l.c] : []; }
  if (r === 'ev') return ctx.item.evCard ? [locate(g, ctx.item.evCard.uid)?.c ?? ctx.item.evCard] : [];
  if (r === 'created') return ctx.created;
  if (r === 'chosen') return ctx.chosen;
  if (r === 'attached') { const s = findCard(g, ctx.item.sourceUid); const h = s?.attachedTo !== undefined ? findCard(g, s.attachedTo) : undefined; return h ? [h] : []; }
  if (r === 'targets') return (ctx.item.targets ?? []).flatMap(t => (t?.card !== undefined ? [locate(g, t.card)?.c].filter((x): x is Card => !!x) : []));
  const rm = /^tr:(\d+)-(\d+)$/.exec(r); if (rm) { const out: Card[] = []; for (let i = +rm[1]; i <= +rm[2]; i++) { const t = ctx.item.targets?.[i]; const l = t?.card !== undefined ? locate(g, t.card) : undefined; if (l) out.push(l.c); } return out; }
  const m = /^t(\d+)$/.exec(r); if (m) { const t = (ctx.item.targets ?? (ctx.item.target ? [ctx.item.target] : []))[+m[1]]; if (t?.card !== undefined) { const l = locate(g, t.card); return l ? [l.c] : []; } }
  return [];
}
export function refPlayers(g: Game, ctx: ResCtx, r: PRef | undefined): number[] {
  const me = ctx.item.controller;
  if (!r || r === 'you') return [me];
  if (r === 'opps') return opponents(g, me).map(p => p.id);
  if (r === 'all') return alive(g).map(p => p.id);
  if (r === 'evp') return ctx.item.event?.player !== undefined ? [ctx.item.event.player] : [];
  if (r === 'active') return [g.active];
  if (r === 'def') { const s = findCard(g, ctx.item.sourceUid); return s?.attacking !== undefined ? [s.attacking] : []; }
  const m = /^(ctl:|owner:)?(t\d+|ev|self)$/.exec(r);
  if (m) {
    if (!m[1] && m[2].startsWith('t')) { const t = (ctx.item.targets ?? [])[+m[2].slice(1)]; if (t?.player !== undefined) return [t.player]; }
    const cs = refCards(g, ctx, m[2]); return cs.length ? [ctl(cs[0])] : [];
  }
  return [];
}
export function amt(g: Game, ctx: ResCtx, a: Amt | undefined): number {
  if (a === undefined) return 0; if (typeof a === 'number') return a;
  const me = ctx.item.controller;
  if (typeof a === 'string') {
    if (a === 'X') return ctx.item.x ?? findCard(g, ctx.item.sourceUid)?.x ?? 0;
    if (a === 'ev') return ctx.item.event?.amount ?? 0;
    if (a === 'speed') return g.players[me].speed ?? 0;
    if (a === 'spent') return ctx.item.event?.spent ?? 0;
    if (a === 'chosen') return ctx.chosen.length;
    if (a === 'created') return ctx.created.length;
    return 0;
  }
  if ('pips' in a) { const c = ctx.item.evCard; return c ? colorPips(def(c), a.pips) : 0; }
  if ('maxPow' in a) return Math.max(0, ...g.players[me].battlefield.filter(c => isType(c, 'Creature') && matches(g, c, a.maxPow, me, -1)).map(c => power(g, c)));
  if ('count' in a) {
    const pls = a.pl ? refPlayers(g, ctx, a.pl) : g.players.map(p => p.id);
    return pls.reduce((s, pid) => s + g.players[pid][a.zone ?? 'battlefield'].filter(c => matches(g, c, a.count, me, -1)).length, 0);
  }
  if ('pow' in a || 'tough' in a) { const r = 'pow' in a ? a.pow : (a as { tough: Ref }).tough; const c = refCards(g, ctx, r)[0]; const lki = r === 'self' && !c ? ctx.item.srcLki : undefined; if (!c && !lki) return 0; const onBf = c && findCard(g, c.uid); const v = onBf ? ('pow' in a ? power(g, c!) : toughness(g, c!)) : (c?.lki ?? lki ?? { p: def(c!).power ?? 0, t: def(c!).toughness ?? 0 })['pow' in a ? 'p' : 't']; return Math.max(0, v); }
  if ('mv' in a) { const c = refCards(g, ctx, a.mv)[0]; return c ? cmc(def(c)) : 0; }
  if ('cards' in a) return refPlayers(g, ctx, a.pl).reduce((s, pid) => s + g.players[pid][a.cards].filter(c => matches(g, c, a.f, me)).length, 0);
  if ('life' in a) return refPlayers(g, ctx, a.life).reduce((s, pid) => s + g.players[pid].life, 0);
  if ('mul' in a) return a.mul * amt(g, ctx, a.of);
  if ('plus' in a) return a.plus + amt(g, ctx, a.of);
  if ('half' in a) return Math.ceil(amt(g, ctx, a.half) / 2);
  if ('ctr' in a) { const c = refCards(g, ctx, a.who)[0]; return c ? ctr(c, a.ctr) : 0; }
  if ('devotion' in a) return g.players[me].battlefield.reduce((s, c) => s + a.devotion.reduce((x, k) => x + (def(c).cost[k] ?? 0) + (def(c).cost.hyb?.filter(h => h.includes(k)).length ?? 0), 0), 0);
  if ('opps' in a) return opponents(g, me).length;
  if ('mvMaxNC' in a) { const P0 = g.players[me]; return Math.max(0, ...P0.battlefield.filter(x => !isType(x, 'Creature')).map(x => cmc(def(x))), ...P0.graveyard.filter(x => !isType(x, 'Creature')).map(x => cmc(def(x)))); }
  if ('lostWay' in a) return (ctx.ans['lostWay'] as number) ?? 0;
  if ('lifeLost' in a) return opponents(g, me).reduce((s, o) => s + o.lostLife, 0);
  if ('lifeGained' in a) return g.players[me].gained;
  if ('mvSum' in a) return g.players[me].battlefield.filter(c => matches(g, c, a.mvSum, me)).reduce((s, c) => s + cmc(def(c)), 0);
  if ('colorsOf' in a) { const c = refCards(g, ctx, a.colorsOf)[0]; return c ? def(c).colors.length : 0; }
  if ('ffColors' in a) { const P = g.players[me]; const s = new Set<string>(P.battlefield.flatMap(c => def(c).colors)); if (P.spellCols?.turn === g.turn) for (const k of P.spellCols.cols) s.add(k); return s.size; }
  return 0;
}
/** Token doubling (Elspeth, Storm Slayer / Kaya's -2): 2^n multiplier for tokens created under pid's control. */
const tokMul = (g: Game, pid: number) => 2 ** (liveSources(g).filter(c => ctl(c) === pid && def(c).statics?.some(st => st.k === 'tokenDouble')).length + (g.players[pid].tokDouble === g.turn ? 1 : 0));
const onBf = (g: Game, cs: Card[]) => cs.filter(c => !!findCard(g, c.uid));
const bestFirst = (g: Game, cs: Card[]) => [...cs].sort((a, b) => valueOf(g, b) - valueOf(g, a));
function exec(g: Game, ctx: ResCtx, e: Effect, key: string): void {
  const me = ctx.item.controller; const P = g.players[me];
  const n = () => amt(g, ctx, e.n ?? 1);
  const who = () => refCards(g, ctx, e.who);
  const src = findCard(g, ctx.item.sourceUid) ?? srcOf(g, ctx) ?? ctx.item.card ?? ({ id: ctx.item.sourceId, uid: ctx.item.sourceUid, owner: me } as Card);
  const srcName = CARDS[ctx.item.sourceId].name; CT_SRC = src;
  const legacyT = ctx.item.target; const tc = legacyT?.card !== undefined ? findCard(g, legacyT.card) : undefined;
  switch (e.op) {
    // ---- legacy hand-written ops ----
    case 'loseLife': loseLife(g, me, n()); break;
    case 'gainLife': gainLife(g, me, n()); break;
    case 'damageEachOpp': for (const o of opponents(g, me)) dealDamage(g, ctx.item.sourceId, src, { player: o.id }, n()); break;
    case 'damageEventPlayer': if (ctx.item.event?.player !== undefined) dealDamage(g, ctx.item.sourceId, src, { player: ctx.item.event.player }, n()); break;
    case 'drain': { const os = opponents(g, me); for (const o of os) loseLife(g, o.id, n()); gainLife(g, me, n() * os.length); break; }
    case 'exileGainPower': if (tc) { const pw = power(g, tc); const o = ctl(tc); exileCard(g, tc); gainLife(g, o, pw); } break;
    case 'exilePath': if (tc) { const o = ctl(tc); exileCard(g, tc); searchBasicAuto(g, o); } break;
    case 'pumpSelf': { const s = findCard(g, ctx.item.sourceUid); if (s) { s.pp += n(); s.pt += amt(g, ctx, e.m ?? 0); } break; }
    case 'searchBasic': for (let i = 0; i < n(); i++) searchBasicAuto(g, me, e.toHand); break;
    case 'drawEventAmount': draw(g, me, ctx.item.event?.amount ?? 0); break;
    case 'eventPlayerDrawsEventAmount': if (ctx.item.event?.player !== undefined && !g.players[ctx.item.event.player].lost) draw(g, ctx.item.event.player, ctx.item.event.amount ?? 0); break;
    // ---- generic ops ----
    case 'draw': { const k = n(); for (const pid of refPlayers(g, ctx, e.pl)) { draw(g, pid, k); if (k) log(g, `${g.players[pid].name} draws ${k} card${k > 1 ? 's' : ''}.`); } break; }
    case 'gain': { const k = n(); for (const pid of refPlayers(g, ctx, e.pl)) { gainLife(g, pid, k); log(g, `${g.players[pid].name} gains ${k} life.`); } break; }
    case 'lose': { const k = n(); for (const pid of refPlayers(g, ctx, e.pl)) { const b = g.players[pid].life; loseLife(g, pid, k); ctx.ans['lostWay'] = ((ctx.ans['lostWay'] as number) ?? 0) + Math.max(0, b - g.players[pid].life); log(g, `${g.players[pid].name} loses ${k} life.`); } break; }
    case 'damage': {
      const k = n();
      if (e.who === undefined && e.pl === undefined && legacyT) { if (tc) dealDamage(g, ctx.item.sourceId, src, { card: tc }, k); else if (legacyT.player !== undefined) dealDamage(g, ctx.item.sourceId, src, { player: legacyT.player }, k); break; }
      for (const c of onBf(g, who())) dealDamage(g, ctx.item.sourceId, src, { card: c }, k);
      if (e.who && typeof e.who === 'string' && /^t\d+$/.test(e.who)) { const t = ctx.item.targets?.[+e.who.slice(1)]; if (t?.player !== undefined) dealDamage(g, ctx.item.sourceId, src, { player: t.player }, k); }
      if (e.pl) for (const pid of refPlayers(g, ctx, e.pl)) dealDamage(g, ctx.item.sourceId, src, { player: pid }, k);
      break;
    }
    case 'destroy': for (const c of onBf(g, e.who ? who() : tc ? [tc] : [])) destroy(g, c); break;
    case 'exile': for (const c of e.who ? who() : tc ? [tc] : []) { if (findCard(g, c.uid)) exileCard(g, c); else if (locate(g, c.uid)) { moveCard(g, c, 'exile', { quiet: true }); log(g, `${nm(c)} is exiled.`); } } break;
    case 'bounce': for (const c of e.who ? who() : tc ? [tc] : []) { if (!locate(g, c.uid)) continue; moveCard(g, c, 'hand'); log(g, `${nm(c)} returns to ${g.players[c.owner].name}'s hand.`); } break;
    case 'tuck': for (const c of onBf(g, who())) { const depth = typeof e.n === 'number' ? e.n : 0; moveCard(g, c, e.dest === 'top' ? 'top' : 'bottom'); if (depth) { const L = g.players[c.owner].library; const i = L.indexOf(c); if (i >= 0) { L.splice(i, 1); L.splice(Math.max(0, L.length - depth), 0, c); } log(g, `${nm(c)} is put into its owner's library ${depth === 1 ? 'second' : 'third'} from the top.`); continue; } log(g, `${nm(c)} is put on the ${e.dest === 'top' ? 'top' : 'bottom'} of its owner's library.`); } break;
    case 'tap': for (const c of onBf(g, who())) c.tapped = true; break;
    case 'untap': for (const c of onBf(g, who())) c.tapped = false; break;
    case 'counter': {
      const ti = typeof e.who === 'string' && /^t\d+$/.test(e.who) ? +e.who.slice(1) : 0; const t = ctx.item.targets?.[ti] ?? legacyT; const s = g.stack.find(x => x.id === t?.stack); if (!s) break;
      if (s.uncounterable || (s.kind === 'spell' && s.card && isType(s.card, 'Creature') && g.players[s.controller].uncCreatures === g.turn)) { log(g, `${s.label} can't be countered.`); break; }
      (ctx as unknown as { counteredCtl?: number }).counteredCtl = s.controller; ctx.ans['@ctr'] = s.kind === 'spell' ? 0 : s.sourceUid; g.stack = g.stack.filter(x => x !== s); log(g, `${s.label} is countered.`);
      if (s.kind === 'spell') { emit(g, 'counters', { player: me }, s.card); if (s.card) spellAway(g, s); } break;
    }
    case 'silenceSrc': { const uid = ctx.ans['@ctr'] as number | undefined; const perm = uid ? findCard(g, uid) : undefined; const srcP = findCard(g, ctx.item.sourceUid); if (!perm || !srcP) break; const td = def(perm); if (!(td.types.includes('Artifact') || td.types.includes('Creature') || td.types.includes('Planeswalker'))) break; perm.loseSrc = srcP.uid; layer(g); log(g, `${nm(perm)} loses all abilities for as long as ${nm(srcP)} remains on the battlefield.`); break; }
    case 'freeze': for (const c of onBf(g, who())) { c.freeze = ctl(c); log(g, `${nm(c)} doesn't untap during its controller's next untap step.`); } break;
    case 'floodIsland': for (const c of onBf(g, who())) { if (!isType(c, 'Land')) continue; c.floodIsle = true; addCounters(g, c, 'flood', 0); layer(g); log(g, `${nm(c)} is an Island for as long as it has a flood counter.`); } break;
    case 'highTide': g.highTide = g.turn; layer(g); log(g, `Until end of turn, Islands add an additional {U}.`); break;
    case 'reorder': {
      const k = Math.min(n(), P.library.length); if (!k) break; const top = P.library.slice(-k).reverse();
      const a = ask<{ order: number[] }>(g, ctx, key, { pid: me, kind: 'orderTop', cards: top, text: `${srcName}: put these cards back on top of your library in any order (1 = top).` });
      const ordered = (a.order ?? []).map(u => top.find(c => c.uid === u)).filter((c): c is Card => !!c); const rest = top.filter(c => !ordered.includes(c));
      const seq = [...ordered, ...rest]; P.library = P.library.filter(c => !top.includes(c)); P.library.push(...[...seq].reverse());
      log(g, `${P.name} puts ${seq.length} card${seq.length === 1 ? '' : 's'} back on top (${nm(seq[0])} on top).`); break;
    }
    case 'mayShuffle': if (ask<boolean>(g, ctx, key, { pid: me, kind: 'may', text: `${srcName}: shuffle your library?` })) { shuffle(g, P.library); log(g, `${P.name} shuffles.`); } break;
    case 'tapToggle': { const c = onBf(g, who())[0]; if (!c) break; const tap = ask<string>(g, ctx, key, { pid: me, kind: 'color', options: ['Tap it', 'Untap it'], text: `${srcName}: tap or untap ${nm(c)}?` }).startsWith('Tap'); c.tapped = tap; log(g, `${P.name} ${tap ? 'taps' : 'untaps'} ${nm(c)}.`); break; }
    case 'champion': { const s = findCard(g, ctx.item.sourceUid); const ty = s ? CARDS[s.id]?.champion : undefined; if (!s || !ty || !findCard(g, s.uid)) break;
      const cands = P.battlefield.filter(c => c !== s && isTypeOrSub(def(c), ty));
      if (!cands.length || !ask<boolean>(g, ctx, key, { pid: me, kind: 'may', text: `${srcName}: exile another ${ty} you control? If you don't, sacrifice ${nm(s)}.` })) { log(g, `${P.name} sacrifices ${nm(s)} (champion).`); sacrifice(g, s); break; }
      const a = cands.length === 1 ? [cands[0].uid] : ask<number[]>(g, ctx, key + ':c', { pid: me, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: exile a ${ty} you control.` });
      const ex = cands.find(c => c.uid === a[0]); if (!ex) { sacrifice(g, s); break; }
      moveCard(g, ex, 'exile'); s.champ = ex.uid; log(g, `${P.name} exiles ${nm(ex)} (championed by ${nm(s)}).`); break; }
    case 'championBack': { const l = locate(g, ctx.item.sourceUid); const uid = l?.c.champ; if (uid === undefined) break; const ex = g.players.flatMap(q => q.exile).find(c => c.uid === uid); if (!ex || ex.token) break; delete l?.c.champ; moveCard(g, ex, 'battlefield'); log(g, `${nm(ex)} returns to the battlefield.`); break; }
    case 'soulPair': { const s = findCard(g, ctx.item.sourceUid); if (!s || s.pair !== undefined || !isType(s, 'Creature')) break;
      let other = e.who === 'ev' ? (ctx.item.evCard && findCard(g, ctx.item.evCard.uid)) : undefined;
      if (e.who !== 'ev') { const cands = creatures(P).filter(c => c !== s && c.pair === undefined); if (!cands.length) break; if (!ask<boolean>(g, ctx, key, { pid: me, kind: 'may', text: `${srcName}: pair it with another unpaired creature you control?` })) break; const a = cands.length === 1 ? [cands[0].uid] : ask<number[]>(g, ctx, key + ':p', { pid: me, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: choose a creature to pair with.` }); other = cands.find(c => c.uid === a[0]); }
      else if (!other || other.pair !== undefined || ctl(other) !== me || !isType(other, 'Creature') || !ask<boolean>(g, ctx, key, { pid: me, kind: 'may', text: `${srcName}: pair it with ${nm(other)}?` })) break;
      if (!other || other.pair !== undefined) break; s.pair = other.uid; other.pair = s.uid; log(g, `${nm(s)} pairs with ${nm(other)}.`); break; }
    case 'pump': { const p = n(); const m = amt(g, ctx, e.m ?? 0); for (const c of onBf(g, e.who ? who() : tc ? [tc] : [])) { if (e.until === 'yourNext') { const x = (c.nx ??= { by: me, p: 0, t: 0, kw: [] }); x.p += p; x.t += m; } else { c.pp += p; c.pt += m; } } break; }
    case 'emblem': { const d = e.emb as CardDef | undefined; if (!d) break; CARDS[d.id] ??= d; for (const pid of refPlayers(g, ctx, e.pl ?? 'you')) { { const em = inst(g, d.id, pid); em.ts = nextTs(g); (g.players[pid].emblems ??= []).push(em); } { const nmP = g.players[pid].name; log(g, `${nmP} ${nmP === 'You' ? 'get' : 'gets'} an emblem: ${(d.text ?? d.name).replace(/\.$/, '')}.`); } } layer(g); break; }
    case 'steal': for (const c of onBf(g, who())) { const back = c.owner; changeControl(g, c, me); if (e.until === 'eot') (g.steals ??= []).push({ uid: c.uid, back }); } break;
    case 'extraTurn': { const k = n(); P.extraTurns = (P.extraTurns ?? 0) + k; log(g, `${P.name} will take ${k > 1 ? k + ' extra turns' : 'an extra turn'}.`); break; }
    case 'winGame': if (!P.lost) winGame(g, me); break;
    case 'flashSorc': P.flashSorc = true; log(g, `${P.name} may cast sorceries as though they had flash until their next turn.`); break;
    case 'uncCreatures': P.uncCreatures = g.turn; break;
    case 'tokDouble': P.tokDouble = g.turn; break;
    case 'lookTopMayBottom': for (const pid of refPlayers(g, ctx, e.pl)) { const q = g.players[pid]; const top = q.library[q.library.length - 1]; if (!top) continue;
      const yes = ask<boolean>(g, ctx, key, { pid: me, kind: 'may', text: `${srcName}: the top card of ${q.name === 'You' ? 'your' : q.name + "'s"} library is ${nm(top)}. Put it on the bottom?` });
      if (yes) { q.library.pop(); q.library.unshift(top); } log(g, `${P.name} looks at the top card of ${q.name}'s library${yes ? ' and puts it on the bottom' : ''}.`); } break;
    case 'exileLibrary': for (const pid of refPlayers(g, ctx, e.pl)) { const q = g.players[pid]; log(g, `${q.name}'s library (${q.library.length} cards) is exiled.`); q.exile.push(...q.library); q.library = []; } break;
    case 'shuffleHandIn': for (const pid of refPlayers(g, ctx, e.pl)) { const q = g.players[pid]; q.library.push(...q.hand); q.hand = []; shuffle(g, q.library); log(g, `${q.name} shuffles their hand into their library.`); } break;
    case 'keepEachType': { // each player chooses a permanent of each permanent type and sacrifices the rest
      const TY = ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker', 'Battle'];
      for (const pid of refPlayers(g, ctx, e.pl)) { const q = g.players[pid]; const keep = new Set<number>();
        TY.forEach((ty, i) => { const cands = q.battlefield.filter(c => isType(c, ty)); if (!cands.length) return; if (cands.some(c => keep.has(c.uid))) return;
          const a = cands.length === 1 ? [cands[0].uid] : ask<number[]>(g, ctx, `${key}:${pid}:${i}`, { pid, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: choose ${ty === 'Artifact' || ty === 'Enchantment' ? 'an' : 'a'} ${ty.toLowerCase()} to keep.` }); keep.add(a[0]); });
        for (const c of [...q.battlefield]) if (!keep.has(c.uid)) { ctx.chosen.push(c); sacrifice(g, c); }
        log(g, `${q.name} keeps ${[...keep].map(u => nm(findCard(g, u)!)).join(', ') || 'nothing'} and sacrifices the rest.`); }
      break; }
    case 'piles': { // you separate target player's permanents into two piles; they sacrifice the pile of their choice
      for (const pid of refPlayers(g, ctx, e.pl)) { const q = g.players[pid]; const all = [...q.battlefield]; if (!all.length) continue;
        const a = ask<number[]>(g, ctx, `${key}:${pid}:split`, { pid: me, kind: 'pick', cards: all, min: 0, max: all.length, zone: 'battlefield', text: `${srcName}: choose the permanents for pile A (the rest form pile B). ${q.name} sacrifices one pile.` });
        const A = all.filter(c => a.includes(c.uid)); const B = all.filter(c => !a.includes(c.uid));
        const sacA = ask<boolean>(g, ctx, `${key}:${pid}:pick`, { pid, kind: 'may', text: `${srcName}: sacrifice pile A (${A.map(nm).join(', ') || 'empty'})? Otherwise you sacrifice pile B (${B.map(nm).join(', ') || 'empty'}).` });
        const gone = sacA ? A : B; for (const c of gone) if (findCard(g, c.uid)) sacrifice(g, c);
        log(g, `${q.name} sacrifices pile ${sacA ? 'A' : 'B'} (${gone.length} permanent${gone.length === 1 ? '' : 's'}).`); }
      break; }
    case 'animAll': { const p = n(), t = amt(g, ctx, e.m ?? 0); for (const c of onBf(g, who())) c.anim = { p, t, ts: nextTs(g) }; layer(g); log(g, `${srcName}: ${who().length} permanent(s) become ${p}/${t} creatures until end of turn.`); break; }
    case 'addType': for (const c of onBf(g, who())) (g.ces ??= []).push({ ts: nextTs(g), uid: c.uid, until: 'perm', by: me, addSub: e.kw, addColors: e.mana as Color[] | undefined }); layer(g); break;
    case 'loseGame': for (const pid of refPlayers(g, ctx, e.pl)) { const q = g.players[pid]; if (!q.lost) lose(g, q, `${srcName}`); } break;
    case 'amass': { // put +1/+1 counters on an Army you control; create a 0/0 black Army first if you have none
      const k = n(); let army = P.battlefield.find(c => isTypeOrSub(def(c), 'Army') && isType(c, 'Creature'));
      if (!army) army = createToken(g, me, { name: `${e.text ? e.text + ' ' : ''}Army`, p: 0, t: 0, colors: ['B'], types: ['Creature'], sub: [...(e.text ? [e.text] : []), 'Army'] });
      addCounters(g, army, '+1/+1', k); ctx.chosen.push(army); log(g, `${P.name} amasses ${k}.`); break;
    }
    case 'revealTop': { // reveal top N; matching cards go to dest, the rest to `rest`
      const k = Math.min(n(), P.library.length); const top = P.library.splice(P.library.length - k, k).reverse();
      const hit = top.filter(c => matches(g, c, e.f, me)); const rest = top.filter(c => !hit.includes(c));
      log(g, `${P.name} reveals ${top.map(nm).join(', ') || 'nothing'}.`);
      for (const c of hit) { ctx.chosen.push(c); if (e.dest === 'battlefield') enter(g, c, me, { tapped: e.tapped }); else P.hand.push(c); }
      if (e.rest === 'graveyard') P.graveyard.push(...rest); else if (e.rest === 'hand') P.hand.push(...rest); else { shuffle(g, rest); P.library.unshift(...rest); }
      break;
    }
    case 'revealUntil': { // reveal until a matching card; it goes to dest, the rest to the bottom in a random order
      const seen: Card[] = []; let hit: Card | undefined;
      while (P.library.length) { const c = P.library.pop()!; if (matches(g, c, e.f, me)) { hit = c; break; } seen.push(c); }
      log(g, `${P.name} reveals ${[...seen, ...(hit ? [hit] : [])].map(nm).join(', ') || 'nothing'}${hit ? ` and takes ${nm(hit)}` : ''}.`);
      if (hit) { ctx.chosen.push(hit); if (e.dest === 'battlefield') enter(g, hit, me, {}); else P.hand.push(hit); }
      shuffle(g, seen); P.library.unshift(...seen); break;
    }
    case 'lifeBecomes': { const k = n(); for (const pid of refPlayers(g, ctx, e.pl)) { const q = g.players[pid]; if (k < q.life) { q.lostLife += q.life - k; } q.life = k; log(g, `${q.name}'s life total becomes ${k}.`); } break; }
    case 'animate': { const s = findCard(g, ctx.item.sourceUid); if (s) { s.anim = { p: n(), t: amt(g, ctx, e.m ?? 0), kw: e.kw, prevent: !!e.eot, ts: nextTs(g) }; log(g, `${nm(s)} becomes a ${s.anim.p}/${s.anim.t} creature.`); layer(g); } break; }
    case 'dmgPlayerAndCreatures': { const k = n(); const t = ctx.item.targets?.[0]; let pid = t?.player; let wc: Card | undefined; if (t?.card !== undefined) { wc = findCard(g, t.card); pid = wc?.owner; } if (pid === undefined) break;
      if (wc) dealDamage(g, ctx.item.sourceId, src, { card: wc }, k); else dealDamage(g, ctx.item.sourceId, src, { player: pid }, k);
      for (const c of [...g.players[pid].battlefield]) if (isType(c, 'Creature') || (e.f?.types?.includes('Planeswalker') && isType(c, 'Planeswalker') && c !== wc)) dealDamage(g, ctx.item.sourceId, src, { card: c }, k); break; }
    case 'grant': for (const c of onBf(g, who())) { if (e.until === 'perm') c.pkw = [...(c.pkw ?? []), ...(e.kw ?? [])]; else if (e.until === 'yourNext') (c.nx ??= { by: me, p: 0, t: 0, kw: [] }).kw.push(...(e.kw ?? [])); else c.kw = [...(c.kw ?? []), ...(e.kw ?? [])]; } break;
    case 'addC': { const k = n(); for (const c of onBf(g, who())) addCounters(g, c, e.kind ?? '+1/+1', k); break; }
    case 'remC': { const k = n(); for (const c of onBf(g, who())) addCounters(g, c, e.kind ?? '+1/+1', -k); break; }
    case 'proliferate': for (const c of g.players.flatMap(p => p.battlefield)) for (const [k, v] of Object.entries(c.counters ?? {})) if (v > 0 && ((ctl(c) === me) === (k !== '-1/-1'))) addCounters(g, c, k, 1); for (const o of opponents(g, me)) if (o.poison) { o.poison++; } log(g, `${P.name} proliferates.`); break;
    case 'token': {
      const k = n(); const pls = refPlayers(g, ctx, e.pl);
      for (const pid of pls) for (let i = 0; i < k * tokMul(g, pid); i++) ctx.created.push(createToken(g, pid, e.tok!, { tapped: e.tapped, attackingLike: e.attacking ? src : undefined }));
      if (k) { const tm = pls.length === 1 ? k * tokMul(g, pls[0]) : k; log(g, `${pls.map(p => g.players[p].name).join(', ')} create${pls.length === 1 && pls[0] !== 0 ? 's' : ''} ${tm} ${e.tok!.name} token${tm > 1 ? 's' : ''}${tm !== k ? ' (doubled)' : ''}.`); }
      break;
    }
    case 'empower': {
      const k = n(); const isJ = (c: Card) => !!c.token && isType(c, 'Planeswalker') && (def(c).sub ?? []).includes('Jace');
      let j = P.battlefield.find(isJ);
      if (!j) { for (let i = 0; i < tokMul(g, me); i++) ctx.created.push(createToken(g, me, e.tok!)); j = P.battlefield.find(isJ); log(g, `${P.name} creates a Jace planeswalker token.`); }
      if (j) { addCounters(g, j, 'loyalty', k); log(g, `${P.name} puts ${k} loyalty counter${k === 1 ? '' : 's'} on Jace.`); }
      break;
    }
    case 'endure': { const k = n(); if (k <= 0) break; for (const c of refCards(g, ctx, e.who ?? 'self')) {
        const on = !!findCard(g, c.uid); const ctr1 = on && ask<boolean>(g, ctx, `${key}:${c.uid}`, { pid: ctl(c), kind: 'may', text: `${nm(c)} endures ${k}: put ${k} +1/+1 counter${k > 1 ? 's' : ''} on it? (No: create a ${k}/${k} white Spirit token)` });
        if (ctr1) { addCounters(g, c, '+1/+1', k); log(g, `${nm(c)} endures ${k} (+1/+1 counters).`); } else { createToken(g, ctl(c), { name: 'Spirit', p: k, t: k, colors: ['W'], types: ['Creature'], sub: ['Spirit'] }); log(g, `${nm(c)} endures ${k} (${k}/${k} Spirit).`); } }
      break; }
    case 'earthbend': { const k = n(); for (const c of onBf(g, who())) { if (!isType(c, 'Land')) continue; c.anim = { p: 0, t: 0, kw: ['haste'], ts: nextTs(g), perm: true }; c.earthbent = true; layer(g); addCounters(g, c, '+1/+1', k); log(g, `${nm(c)} becomes a 0/0 land creature with haste and gets ${k} +1/+1 counters (earthbend ${k}).`); } layer(g); break; }
    case 'cmdrToHand': { const cs = P.command.filter(c => isCommander(g, c)); if (!cs.length) break; const u = cs.length === 1 ? [cs[0].uid] : ask<number[]>(g, ctx, key, { pid: me, kind: 'pick', cards: cs, min: 1, max: 1, zone: 'command', text: `${srcName}: put your commander into your hand.` }); const c = cs.find(x => x.uid === u[0]); if (c) { P.command = P.command.filter(x => x !== c); P.hand.push(c); log(g, `${P.name} puts ${nm(c)} into their hand from the command zone.`); } break; }
    case 'earthReturn': { const u = e.n as number; const o = g.players.find(q => q.graveyard.some(x => x.uid === u) || q.exile.some(x => x.uid === u)); const c = o && [...o.graveyard, ...o.exile].find(x => x.uid === u); if (c) { moveCard(g, c, 'battlefield', { tapped: true }); log(g, `${nm(c)} returns to the battlefield tapped.`); } break; }
    case 'blight': { const k = n(); for (const pid of refPlayers(g, ctx, e.pl)) { const cands = creatures(g.players[pid]); if (!cands.length || k <= 0) continue; const a = cands.length === 1 ? [cands[0].uid] : ask<number[]>(g, ctx, `${key}:${pid}`, { pid, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: blight ${k} — put ${k} -1/-1 counter${k > 1 ? 's' : ''} on a creature you control.` }); const c = cands.find(x => x.uid === a[0]); if (c) { addCounters(g, c, '-1/-1', k); ctx.chosen.push(c); log(g, `${g.players[pid].name} blights ${k}: ${nm(c)} gets ${k} -1/-1 counter${k > 1 ? 's' : ''}.`); } } break; }
    case 'transform': for (const c of onBf(g, who())) { if (!frontDef(c)?.back || frontDef(c)?.mdfc) continue; const was = nm(c); flipFace(c); layer(g); log(g, `${was} transforms into ${nm(c)}.`); emit(g, 'transformed', { player: ctl(c) }, c); } break;
    case 'exileRetT': for (const c of onBf(g, who())) { const pid = ctl(c); exileCard(g, c); const x = g.players[c.owner].exile.find(y => y.uid === c.uid); if (x) moveCard(g, x, 'battlefield', { ctl: pid, transformed: !!CARDS[x.id]?.back }); } break;
    case 'warpExile': for (const c of onBf(g, who())) { exileCard(g, c); const x = g.players[c.owner].exile.find(y => y.uid === c.uid); if (x) { x.mayPlay = 1e9; x.warpAfter = g.turn; } } break;
    case 'fireMana': { const k = n(); for (let i = 0; i < k; i++) P.pool.push('R'); P.fireMana = (P.fireMana ?? 0) + k; log(g, `${P.name} adds ${'{R}'.repeat(k)} (firebending, until end of combat).`); break; }
    case 'delaySac': for (const c of who()) addDelayed(g, ctx, { at: 'endStep', label: `sacrifice ${nm(c)}`, effects: [{ op: 'sacUid', who: `uid:${c.uid}` }] }); break;
    case 'sacUid': for (const c of onBf(g, who())) if (ctl(c) === me) { log(g, `${P.name} sacrifices ${nm(c)}.`); sacrifice(g, c); } break;
    case 'classLevel': { if (src) { src.classLvl = e.n as number; log(g, `${nm(src)} becomes level ${e.n}.`); emit(g, 'classLevel', { player: me, amount: e.n as number }, src); } break; }
    case 'chosenReset': ctx.chosen.length = 0; break;
    case 'saddled': { if (src) { const first = src.saddled !== g.turn; src.saddled = g.turn; log(g, `${nm(src)} becomes saddled.`); if (first) emit(g, 'saddled', { player: me }, src); } break; }
    case 'crewed': { if (src) emit(g, 'crewed', { player: me }, src); break; }
    case 'prep': { for (const c of onBf(g, who())) { if (!CARDS[c.id]?.prepDef || !isType(c, 'Creature')) continue; const on = !!n(); if (!!c.prepared === on) continue; c.prepared = on || undefined; log(g, `${nm(c)} becomes ${on ? '' : 'un'}prepared.`); } layer(g); break; }
    case 'copyTok': { const k = n() * tokMul(g, me); for (const c of who()) for (let i = 0; i < k; i++) { const id = e.kind === 'nl' || e.kw?.length ? copyModId(c.id, { nl: e.kind === 'nl', kw: e.kw }) : c.id; ctx.created.push(createToken(g, me, id)); log(g, `${P.name} creates a token copy of ${nm(c)}${e.kw?.length ? ` with ${e.kw.join(', ')}` : ''}.`); } break; }
    case 'search': {
      const sp = e.pl ? refPlayers(g, ctx, e.pl)[0] : me; if (sp === undefined || g.players[sp].lost) break;
      if (sp !== me) { exec(g, { ...ctx, item: { ...ctx.item, controller: sp } }, { ...e, pl: undefined }, key); break; }
      if (hasPStatic(g, oppIds(g, me), 'noSearch')) { log(g, `${P.name} can't search their library.`); break; }
      const lib = P.library.filter(c => matches(g, c, fX(g, ctx, e.f), me)); const k = Math.min(n(), lib.length);
      const pick = ask<number[]>(g, ctx, key, { pid: me, kind: 'pick', cards: lib, min: 0, max: k, zone: 'library', text: `Search your library: choose up to ${k} ${e.text ?? 'card'}${k > 1 ? 's' : ''} (${e.dest === 'battlefield' ? `onto the battlefield${e.tapped ? ' tapped' : ''}` : e.dest === 'exile' ? 'to exile' : e.dest === 'top' ? 'on top of your library' : 'into your hand'}).` });
      const cs = pick.map(u => P.library.find(c => c.uid === u)).filter((c): c is Card => !!c).slice(0, k);
      for (const c of cs) { P.library = P.library.filter(x => x !== c); ctx.chosen.push(c); }
      shuffle(g, P.library);
      const takeN = e.take !== undefined ? amt(g, ctx, e.take) : cs.length;
      cs.forEach((c, i) => { const dest = i < takeN ? e.dest : e.rest; if (dest === 'battlefield') { enter(g, c, me, { tapped: e.tapped }); } else if (dest === 'exile') P.exile.push(c); else if (dest === 'top') P.library.push(c); else P.hand.push(c); });
      log(g, `${P.name} searches their library${cs.length ? ` and finds ${cs.map(nm).join(', ')}` : ' (finds nothing)'}.`);
      break;
    }
    case 'ret': {
      for (const c of who()) { const l = locate(g, c.uid); if (!l || l.zone === 'battlefield' || (e.zone && l.zone !== e.zone)) continue; if (e.dest === 'battlefield') { moveCard(g, c, 'battlefield', { tapped: e.tapped, ctl: e.ctl === 'you' ? me : c.owner }); } else { const dest = e.dest === 'top' ? 'top' : e.dest === 'bottom' ? 'bottom' : 'hand'; moveCard(g, c, dest); log(g, `${nm(c)} returns to ${g.players[c.owner].name}'s ${dest === 'hand' ? 'hand' : 'library'}.`); } }
      break;
    }
    case 'retPick': {
      const pool = refPlayers(g, ctx, e.pl ?? 'you').flatMap(pid => g.players[pid].graveyard).filter(c => matches(g, c, e.f, me)); const k = Math.min(n(), pool.length);
      const pick = ask<number[]>(g, ctx, key, { pid: me, kind: 'pick', cards: pool, min: e.upTo ? 0 : k, max: k, zone: 'graveyard', text: `Choose ${e.upTo ? 'up to ' : ''}${k} ${e.text ?? 'card'}${k > 1 ? 's' : ''} from a graveyard to return ${e.dest === 'battlefield' ? 'to the battlefield' : 'to hand'}.` });
      for (const u of pick.slice(0, k)) { const c = pool.find(x => x.uid === u); if (!c) continue; ctx.chosen.push(c); if (e.dest === 'battlefield') moveCard(g, c, 'battlefield', { tapped: e.tapped, ctl: me }); else { moveCard(g, c, 'hand'); log(g, `${nm(c)} returns to ${g.players[c.owner].name}'s hand.`); } }
      break;
    }
    case 'sac': {
      const k = n(); const pls = refPlayers(g, ctx, e.pl);
      const picks = pls.map(pid => { const cands = g.players[pid].battlefield.filter(c => matches(g, c, e.f, pid, e.f?.other ? ctx.item.sourceUid : -1)); const m = Math.min(k, cands.length); if (!m) return [] as Card[]; if (m === cands.length) return cands; const a = ask<number[]>(g, ctx, `${key}:${pid}`, { pid, kind: 'pick', cards: cands, min: m, max: m, zone: 'battlefield', text: `${srcName}: sacrifice ${m} ${e.text ?? 'permanent'}${m > 1 ? 's' : ''}.` }); return a.map(u => cands.find(c => c.uid === u)).filter((c): c is Card => !!c).slice(0, m); });
      if (e.dest === 'hand') { for (const cs of picks) for (const c of cs) { moveCard(g, c, 'hand'); log(g, `${g.players[c.owner].name} returns ${nm(c)} to their hand.`); } break; }
      for (const cs of picks) for (const c of cs) { log(g, `${g.players[ctl(c)].name} sacrifices ${nm(c)}.`); ctx.chosen.push(c); c.lki = isType(c, 'Creature') ? { p: power(g, c), t: toughness(g, c) } : undefined; sacrifice(g, c); }
      break;
    }
    case 'discard': {
      const k = n(); const pls = refPlayers(g, ctx, e.pl);
      const picks = pls.map(pid => { const h = g.players[pid].hand; const m = Math.min(k, h.length); if (!m) return [] as Card[]; if (e.upTo) { const a = ask<number[]>(g, ctx, `${key}:${pid}`, { pid, kind: 'pick', cards: [...h], min: 0, max: m, zone: 'hand', text: `${srcName}: discard up to ${m} card${m > 1 ? 's' : ''}.` }); return a.map(u => h.find(c => c.uid === u)).filter((c): c is Card => !!c).slice(0, m); } if (e.random) { const cs = [...h]; shuffle(g, cs); return cs.slice(0, m); } if (m === h.length) return [...h]; const a = ask<number[]>(g, ctx, `${key}:${pid}`, { pid, kind: 'pick', cards: [...h], min: m, max: m, zone: 'hand', text: `${srcName}: discard ${m} card${m > 1 ? 's' : ''}.` }); return a.map(u => h.find(c => c.uid === u)).filter((c): c is Card => !!c).slice(0, m); });
      for (const cs of picks) for (const c of cs) { ctx.chosen.push(c); discardCard(g, c); }
      break;
    }
    case 'mill': { const k = n(); for (const pid of refPlayers(g, ctx, e.pl)) { const p = g.players[pid]; const cs = p.library.splice(Math.max(0, p.library.length - k), k).reverse(); p.graveyard.push(...cs); ctx.chosen.push(...cs); if (cs.length) log(g, `${p.name} mills ${cs.length}: ${cs.map(nm).join(', ')}.`); } break; }
    case 'scry': case 'surveil': {
      const k = Math.min(n(), P.library.length); if (!k) break; const top = P.library.slice(-k).reverse();
      const a = ask<{ top: number[]; away: number[] }>(g, ctx, key, { pid: me, kind: 'scry', cards: top, mode: e.op as 'scry' | 'surveil', text: `${e.op === 'scry' ? 'Scry' : 'Surveil'} ${k}: keep cards on top (in order) or put them ${e.op === 'scry' ? 'on the bottom' : 'into your graveyard'}.` });
      const keep = a.top.map(u => top.find(c => c.uid === u)).filter((c): c is Card => !!c); const away = top.filter(c => !keep.includes(c));
      P.library = P.library.filter(c => !top.includes(c));
      if (e.op === 'scry') P.library.unshift(...away); else P.graveyard.push(...away);
      P.library.push(...[...keep].reverse());
      log(g, `${P.name} ${e.op === 'scry' ? 'scries' : 'surveils'} ${k} (${keep.length} on top, ${away.length} ${e.op === 'scry' ? 'to the bottom' : 'to the graveyard'}).`);
      break;
    }
    case 'look': {
      const k = Math.min(n(), P.library.length); if (!k) break; const top = P.library.slice(-k).reverse(); const take = Math.min(amt(g, ctx, e.take ?? 1), k);
      const ok = top.filter(c => matches(g, c, e.f, me));
      const a = ask<number[]>(g, ctx, key, { pid: me, kind: 'pick', cards: top, min: 0, max: Math.min(take, ok.length), zone: 'library', text: `Look at the top ${k}: choose up to ${take} ${e.text ?? 'card'}${take > 1 ? 's' : ''} to put ${e.dest === 'battlefield' ? 'onto the battlefield' : 'into your hand'}; the rest go ${e.rest === 'graveyard' ? 'to your graveyard' : 'on the bottom'}.` });
      const cs = a.map(u => ok.find(c => c.uid === u)).filter((c): c is Card => !!c).slice(0, take);
      P.library = P.library.filter(c => !top.includes(c));
      for (const c of cs) { ctx.chosen.push(c); if (e.dest === 'battlefield') enter(g, c, me, { tapped: e.tapped }); else P.hand.push(c); }
      const rest = top.filter(c => !cs.includes(c));
      if (e.rest === 'graveyard') P.graveyard.push(...rest); else if (e.rest === 'top') P.library.push(...rest); else P.library.unshift(...rest);
      log(g, `${P.name} looks at the top ${k} card${k > 1 ? 's' : ''}${cs.length ? ` and takes ${cs.map(nm).join(', ')}` : ''}.`);
      break;
    }
    case 'exileTop': { // impulse draw: exile top N, may play them this turn
      const k = n(); const cs = P.library.splice(Math.max(0, P.library.length - k), k);
      for (const c of cs) { c.mayPlay = e.until === 'yourNext' ? g.turn + alive(g).length : g.turn; P.exile.push(c); }
      log(g, `${P.name} exiles ${cs.map(nm).join(', ')} from the top of their library (may play ${e.until === 'yourNext' ? 'until their next turn ends' : 'this turn'}).`); break;
    }
    case 'fight': case 'bite': {
      const a = onBf(g, who())[0]; const b = onBf(g, refCards(g, ctx, e.other))[0]; if (!a || !b) break;
      const pa = power(g, a), pb = power(g, b);
      dealDamage(g, a.id, a, { card: b }, pa); if (e.op === 'fight') dealDamage(g, b.id, b, { card: a }, pb);
      break;
    }
    case 'addMana': {
      const k = n(); const syms = e.mana ?? ['C'];
      for (let i = 0; i < k; i++) for (const s of syms) P.pool.push(s === 'IDENTITY' ? (P.identity.length ? P.identity.join('|') : 'C') : s);
      log(g, `${P.name} adds ${Array.from({ length: k }, () => syms.map(s => `{${s === 'ANY' ? '★' : s}}`).join('')).join('')} (floating).`);
      break;
    }
    case 'goad': for (const c of onBf(g, who())) { c.goad = { by: me, turn: g.turn }; log(g, `${nm(c)} is goaded.`); } break;
    case 'flicker': for (const c of onBf(g, who())) { const tok = c.token; exileCard(g, c); if (tok) continue; if (e.ret === 'eot' || e.ret === 'ownerEnd') { addDelayed(g, ctx, { at: 'endStep', pid: e.ret === 'ownerEnd' ? c.owner : undefined, label: `return ${nm(c)} to the battlefield`, effects: [{ op: 'ret', who: `uid:${c.uid}`, dest: 'battlefield', zone: 'exile' }] }); } else { g.players[c.owner].exile = g.players[c.owner].exile.filter(x => x !== c); g.players[c.owner].command = g.players[c.owner].command.filter(x => x !== c); enter(g, c, c.owner, {}); } } break;
    case 'regen': for (const c of onBf(g, who())) c.regen = (c.regen ?? 0) + 1; break;
    case 'attach': { const eq = onBf(g, who())[0]; const host = onBf(g, refCards(g, ctx, e.other))[0]; if (eq && host) { eq.attachedTo = host.uid; log(g, `${nm(eq)} is attached to ${nm(host)}.`); } break; }
    case 'explore': for (const c of onBf(g, who())) { const top = P.library.pop(); if (!top) continue; if (isType(top, 'Land')) { P.hand.push(top); log(g, `${nm(c)} explores: reveals ${nm(top)} (to hand).`); } else { addCounters(g, c, '+1/+1', 1); P.library.push(top); log(g, `${nm(c)} explores: reveals ${nm(top)}, gets a +1/+1 counter.`); } } break;
    case 'putLand': {
      const cands = P.hand.filter(c => matches(g, c, e.f ?? { types: ['Land'] }, me)); if (!cands.length) break;
      const a = ask<number[]>(g, ctx, key, { pid: me, kind: 'pick', cards: cands, min: 0, max: Math.min(n(), cands.length), zone: 'hand', text: `You may put ${e.text ?? 'a land card'} from your hand onto the battlefield${e.tapped ? ' tapped' : ''}.` });
      for (const u of a) { const c = P.hand.find(x => x.uid === u); if (!c) continue; P.hand = P.hand.filter(x => x !== c); enter(g, c, me, { tapped: e.tapped }); }
      break;
    }
    case 'extraLand': P.extraLands = (P.extraLands ?? 0) + n(); break;
    case 'may': {
      const mp = refPlayers(g, ctx, e.pl)[0] ?? me;
      if (e.ifPaid && !planPayment(g.players[mp], e.ifPaid)) break;
      const yes = ask<boolean>(g, ctx, key, { pid: mp, kind: 'may', text: `${srcName}: ${e.text ?? 'do it'}?` });
      if (yes && e.ifPaid) { const pk = `paid:${key}`; if (!(pk in ctx.ans)) ctx.ans[pk] = pay(g, g.players[mp], e.ifPaid); if (!ctx.ans[pk]) break; }
      if (yes) runSub(g, ctx, e.sub, key);
      break;
    }
    case 'if': { const ck = `cond:${key}`; if (!(ck in ctx.ans)) ctx.ans[ck] = condOk(g, me, e.cond!, src, ctx.item.event, ctx.item.evCard, ctx); if (ctx.ans[ck]) runSub(g, ctx, e.sub, key); else if (e.else) runSub(g, ctx, e.else, `${key}e`); break; }
    case 'repeat': { const rk = `n:${key}`; if (!(rk in ctx.ans)) ctx.ans[rk] = n(); for (let j = 0; j < (ctx.ans[rk] as number); j++) runSub(g, ctx, e.sub, `${key}.${j}`); break; }
    case 'chooseColor': ask<string>(g, ctx, key, { pid: me, kind: 'color', options: COLORS, text: 'Choose a color.' }); break;
    case 'noop': break;
    case 'monarch': for (const pid of refPlayers(g, ctx, e.pl ?? 'you')) becomeMonarch(g, pid); break;
    case 'chooseType': { const ty = chooseTypeAsk(g, ctx, key, me, e.text === 'keep' ? 'keep' : 'mine'); src.chosenType = ty; const real = findAny(g, ctx.item.sourceUid); if (real) real.chosenType = ty; if (ctx.item.card) ctx.item.card.chosenType = ty; log(g, `${P.name} chooses ${ty}.`); break; }
    case 'unless': { // "... unless <payer> pays {N}"
      const payer = refPlayers(g, ctx, e.pl)[0]; const cost = e.ifPaid ?? { generic: 0 }; const q = payer !== undefined ? g.players[payer] : undefined;
      const can = !!q && !q.lost && !!planPayment(q, cost);
      const yes = can && ask<boolean>(g, ctx, key, { pid: payer!, kind: 'may', text: `${srcName}: pay ${costText(cost)}? If you don't: ${e.text ?? 'its effect happens'}.` });
      if (yes && pay(g, q!, cost)) { log(g, `${q!.name} pays ${costText(cost)}.`); break; }
      runSub(g, ctx, e.sub, key); break;
    }
    case 'putBack': { // put N cards from hand on top of library
      const k = Math.min(n(), P.hand.length); if (!k) break;
      const a = k === P.hand.length ? P.hand.map(c => c.uid) : ask<number[]>(g, ctx, key, { pid: me, kind: 'pick', cards: [...P.hand], min: k, max: k, zone: 'hand', text: `${srcName}: put ${k} card${k > 1 ? 's' : ''} from your hand on top of your library.` });
      const cs = a.map(u => P.hand.find(c => c.uid === u)).filter((c): c is Card => !!c).slice(0, k);
      P.hand = P.hand.filter(c => !cs.includes(c)); P.library.push(...cs.reverse()); log(g, `${P.name} puts ${cs.length} card${cs.length > 1 ? 's' : ''} back on top of their library.`); break;
    }
    case 'untapLands': { const k = n(); const ls = P.battlefield.filter(c => c.tapped && isType(c, 'Land')).slice(0, k); for (const c of ls) c.tapped = false; if (ls.length) log(g, `${P.name} untaps ${ls.length} land${ls.length > 1 ? 's' : ''}.`); break; }
    case 'exileGrave': for (const pid of refPlayers(g, ctx, e.pl)) { const q = g.players[pid]; if (q.graveyard.length) log(g, `${q.name}'s graveyard (${q.graveyard.length} cards) is exiled.`); q.exile.push(...q.graveyard); q.graveyard = []; } break;
    case 'becomes': {
      const cs = onBf(g, e.who ? who() : tc ? [tc] : []); const pv = e.n !== undefined ? n() : undefined; const tv = e.m !== undefined ? amt(g, ctx, e.m) : pv;
      for (const c of cs) { const x: CE = { ...(e.ce ?? {}), ts: nextTs(g), uid: c.uid, until: e.until ?? 'perm', by: me }; if (pv !== undefined) { x.p = pv; x.t = tv; }
        if (x.loseAll) { c.kw = undefined; if (c.nx) c.nx.kw = []; } // older 'gains ... until end of turn' grants are overwritten (timestamp order)
        (g.ces ??= []).push(x); }
      layer(g); for (const c of cs) log(g, `${nm({ id: c.id })} ${e.ce?.loseAll ? 'loses all abilities and ' : ''}becomes ${def(c).typeLine}${isType(c, 'Creature') ? ` ${power(g, c)}/${toughness(g, c)}` : ''}${e.until === 'eot' ? ' until end of turn' : e.until === 'yourNext' ? ' until your next turn' : ''}.`);
      break; }
    case 'reflex': { // "[do X]. When you do, [Y]": a reflexive triggered ability goes on the stack after this resolves
      const bk = `b:${key}`; if (!(bk in ctx.ans)) ctx.ans[bk] = ctx.chosen.length;
      runSub(g, ctx, e.sub, key);
      const did = ctx.chosen.length > (ctx.ans[bk] as number) || !!ctx.ans[`paid:${key}.0`] || (e.kind === 'always' && !!findCard(g, ctx.item.sourceUid));
      if (did && e.rt) g.pending.push({ controller: me, sourceId: ctx.item.sourceId, sourceUid: ctx.item.sourceUid, trig: { on: 'x', label: e.rt.label, effects: e.rt.effects, tslots: e.rt.tslots }, evCard: ctx.chosen[ctx.chosen.length - 1], event: { player: me } });
      break; }
    case 'ifDid': { // "[do X]. If you do, [Y]"
      const bk = `b:${key}`; if (!(bk in ctx.ans)) ctx.ans[bk] = ctx.chosen.length;
      runSub(g, ctx, e.sub, key); const dk = `d:${key}`; if (!(dk in ctx.ans)) ctx.ans[dk] = ctx.chosen.length > (ctx.ans[bk] as number);
      if (ctx.ans[dk]) runSub(g, ctx, e.else, `${key}t`); break; }
    case 'exileTopCast': { // exile the top card; you may cast it now; if you don't, [else]
      const ck = `c:${key}`; if (!(ck in ctx.ans)) { const c = P.library.pop(); if (c) { P.exile.push(c); log(g, `${P.name} exiles ${nm(c)} from the top of their library.`); } ctx.ans[ck] = c ? c.uid : -1; }
      const c = P.exile.find(x => x.uid === ctx.ans[ck]);
      const cast = !!c && castNowStep(g, ctx, `${key}:cast`, me, c, !!e.free);
      if (!cast && e.else) runSub(g, ctx, e.else, `${key}e`);
      break; }
    case 'rebound': { const c = P.exile.find(x => x.uid === ctx.item.sourceUid && x.reboundT !== undefined); if (c) { const cast = castNowStep(g, ctx, `${key}:cast`, me, c, true); if (cast || key + ':cast' in ctx.ans) delete c.reboundT; } break; }
    case 'unearth': { const s0 = g.players[me].graveyard.find(x => x.uid === ctx.item.sourceUid); if (!s0) break; moveCard(g, s0, 'battlefield'); s0.unearthed = true; s0.pkw = [...(s0.pkw ?? []), 'haste']; log(g, `${P.name} unearths ${nm(s0)}.`);
      (g.delayed ??= []).push({ at: 'endStep', turnAfter: g.step === 'end' || g.step === 'cleanup' ? g.turn : g.turn - 1, controller: me, sourceId: s0.id, sourceUid: s0.uid, label: `exile ${nm(s0)} (unearth)`, effects: [{ op: 'exileUid', n: s0.uid }] }); break; }
    case 'exileUid': { const l = locate(g, amt(g, ctx, e.n)); if (l?.zone === 'battlefield') exileCard(g, l.c); break; }
    case 'extraCombat': if (g.active === me && (g.step === 'main1' || g.step === 'main2')) { g.extraCombats = (g.extraCombats ?? 0) + 1; log(g, `${P.name} will get an additional combat phase after this main phase.`); } break;
    case 'monstrosity': { const s0 = findCard(g, ctx.item.sourceUid!); if (!s0 || s0.monstrous) break; addCounters(g, s0, '+1/+1', n()); s0.monstrous = true; log(g, `${nm(s0)} becomes monstrous.`); emit(g, 'monstrous', { player: me }, s0); break; }
    case 'melee': { const s0 = findCard(g, ctx.item.sourceUid!); if (!s0) break; const k = new Set(attackers(g).filter(c => g.players[me].battlefield.includes(c) && c.atkPw === undefined).map(c => c.attacking)).size; if (k) exec(g, ctx, { op: 'pumpSelf', n: k, m: k }, `${key}m`); break; }
    case 'connive': for (const c of who()) { // draw, then discard; a nonland discard puts a +1/+1 counter on it
      const pid = locate(g, c.uid)?.p.id ?? c.owner; const Pc = g.players[pid]; const dk = `cv:${key}:${c.uid}`;
      if (!(dk in ctx.ans)) { draw(g, pid, 1); ctx.ans[dk] = 1; }
      const h = Pc.hand; let dc: Card | undefined;
      if (h.length === 1) dc = h[0]; else if (h.length) { const a = ask<number[]>(g, ctx, `${dk}:d`, { pid, kind: 'pick', cards: [...h], min: 1, max: 1, zone: 'hand', text: `${nm(c)} connives: discard a card.` }); dc = h.find(x => x.uid === a[0]); }
      if (dc) { discardCard(g, dc); if (!isType(dc, 'Land') && findCard(g, c.uid)) addCounters(g, c, '+1/+1', 1); }
      log(g, `${nm(c)} connives.`); emit(g, 'connive', { player: pid }, c);
    } break;
    case 'discover': { // discover N / cascade: exile until a nonland card with lesser MV; cast it free or (discover) put it in hand; rest on the bottom at random
      const ck = `dv:${key}`; const k = amt(g, ctx, e.n);
      if (!(ck in ctx.ans)) { const seen: Card[] = []; let hit: Card | undefined;
        while (P.library.length) { const c = P.library.pop()!; if (!isType(c, 'Land') && (e.kind === 'cascade' ? cmc(def(c)) < k : cmc(def(c)) <= k)) { hit = c; P.exile.push(c); break; } seen.push(c); }
        shuffle(g, seen); P.library.unshift(...seen);
        log(g, `${P.name} ${e.kind === 'cascade' ? 'cascades' : `discovers ${k}`}: ${seen.length} card(s) to the bottom${hit ? `, hits ${nm(hit)}` : ''}.`); ctx.ans[ck] = hit ? hit.uid : -1; }
      const hit = P.exile.find(x => x.uid === ctx.ans[ck]);
      const cast = !!hit && castNowStep(g, ctx, `${key}:cast`, me, hit, true);
      if (hit && !cast && P.exile.includes(hit)) { P.exile = P.exile.filter(x => x !== hit); if (e.kind === 'cascade') P.library.unshift(hit); else { P.hand.push(hit); log(g, `${P.name} puts ${nm(hit)} into their hand.`); } }
      break; }
    case 'arcaneDraws': { const cp = (ctx as unknown as { counteredCtl?: number }).counteredCtl;
      if (e.kind === 'you') (g.delayed ??= []).push({ at: 'upkeep', label: 'Arcane Denial: you draw a card', effects: [{ op: 'draw', n: 1 }], turnAfter: g.turn, controller: me, sourceId: ctx.item.sourceId, sourceUid: ctx.item.sourceUid });
      if (e.kind === 'ctl' && cp !== undefined) (g.delayed ??= []).push({ at: 'upkeep', label: 'Arcane Denial: may draw up to two cards', effects: [{ op: 'may', text: 'draw a card', sub: [{ op: 'draw', n: 1 }] }, { op: 'may', text: 'draw a card', sub: [{ op: 'draw', n: 1 }] }], turnAfter: g.turn, controller: cp, sourceId: ctx.item.sourceId, sourceUid: ctx.item.sourceUid });
      break; }
    case 'mayCastFree': for (const c of who()) { const l = locate(g, c.uid); if (l?.zone === 'exile') { c.mayPlay = g.turn; c.mayFree = g.turn; } } if (who().length) log(g, `${P.name} may cast ${who().map(nm).join(', ')} without paying their mana costs this turn.`); break;
    case 'exileLinkTok': { // Ugin, the Ineffable: exile top face down, create a token; when it leaves, the card goes to hand
      const ck = `c:${key}`; if (!(ck in ctx.ans)) { const c = P.library.pop(); if (c) { c.faceDown = true; P.exile.push(c); } ctx.ans[ck] = c ? c.uid : -1; log(g, `${P.name} exiles the top card of their library face down.`); }
      const tok = createToken(g, me, e.tok!); ctx.created.push(tok); if ((ctx.ans[ck] as number) >= 0) tok.linkRet = ctx.ans[ck] as number; log(g, `${P.name} creates a ${e.tok!.name} token.`); break; }
    case 'linkHand': { const l = locate(g, amt(g, ctx, e.n)); if (l && l.zone === 'exile') { l.p.exile = l.p.exile.filter(x => x !== l.c); delete l.c.faceDown; l.p.hand.push(l.c); log(g, `${l.p.name} puts the exiled card into their hand.`); } break; }
    case 'poisonTo': { const k = n(); for (const pid of refPlayers(g, ctx, e.pl)) { const q = g.players[pid]; if ((q.poison ?? 0) < k) { q.poison = k; log(g, `${q.name} now has ${k} poison counters.`); } } break; }
    case 'poison': { const k = n(); for (const pid of refPlayers(g, ctx, e.pl)) { const q = g.players[pid]; q.poison = (q.poison ?? 0) + k; log(g, `${q.name} gets ${k} poison counter${k > 1 ? 's' : ''} (${q.poison}).`); } break; }
    case 'exchange': { const a = onBf(g, who())[0]; const b = onBf(g, refCards(g, ctx, e.other))[0]; if (!a || !b) { log(g, `${srcName}: the exchange doesn't happen (a target is gone).`); break; }
      const ca = ctl(a), cb = ctl(b); if (ca === cb) break; changeControl(g, a, cb); changeControl(g, b, ca); break; }
    case 'keepOneEach': { // for each player, you choose a creature they control; they sacrifice the rest
      const keep = new Set<number>();
      for (const q of alive(g)) { const cands = q.battlefield.filter(c => matches(g, c, e.f, me)); if (!cands.length) continue;
        const a = cands.length === 1 ? [cands[0].uid] : ask<number[]>(g, ctx, `${key}:${q.id}`, { pid: me, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: choose a ${e.text ?? 'creature'} ${q.id === me ? 'you control' : q.name + ' controls'} to keep.` }); keep.add(a[0]); }
      const dk = `done:${key}:sac`; if (!ctx.ans[dk]) { ctx.ans[dk] = true; for (const q of alive(g)) for (const c of [...q.battlefield]) if (matches(g, c, e.f, me) && !keep.has(c.uid)) { ctx.chosen.push(c); sacrifice(g, c); } log(g, `Each player sacrifices all ${e.text ?? 'creature'}s not chosen.`); }
      break; }
    case 'repeatWhile': { // Grist: do sub; if a matching card was milled, do rt and repeat
      for (let j = 0; j < 60; j++) { const before = ctx.chosen.length; const jk = `${key}.${j}`; runSub(g, ctx, e.sub, jk); const milled = ctx.chosen.slice(before);
        if (!milled.some(c => matches(g, c, e.f, me))) break; runSub(g, ctx, e.rt?.effects, `${jk}r`); }
      break; }
    case 'delayRet': for (const c of who()) addDelayed(g, ctx, { at: 'endStep', label: `return ${nm(c)} to the battlefield`, effects: [{ op: 'ret', who: `uid:${c.uid}`, dest: 'battlefield', zone: e.zone ?? 'graveyard' }] }); break;
    case 'addManaOne': { const k = n(); const col = ask<string>(g, ctx, key, { pid: me, kind: 'color', options: COLORS, text: `Choose a color: add ${k} mana of that color.` }); for (let i = 0; i < k; i++) P.pool.push(col); log(g, `${P.name} adds ${k} {${col}}.`); break; }
    case 'script': scriptOp(g, ctx, e, key); break;
    case 'watch': for (const c of onBf(g, who())) (g.watch ??= []).push({ uid: c.uid, ev: e.kind!, controller: me, sourceId: ctx.item.sourceId, sourceUid: ctx.item.sourceUid, label: e.text ?? 'trigger', effects: e.sub ?? [], until: (e.until as Watch['until']) ?? 'eot', by: me }); break;
    case 'sacThis': { const s = findCard(g, ctx.item.sourceUid); if (s) { log(g, `${P.name} sacrifices ${nm(s)}.`); sacrifice(g, s); } break; }
  }
}
/** Card-specific resolution steps (src/engine/scripts.ts maps exact Oracle lines to these). Each must be replay-safe: state changes happen once, guarded by ctx.ans keys, before or after any ask(). */
function scriptOp(g: Game, ctx: ResCtx, e: Effect, key: string): void {
  const me = ctx.item.controller; const P = g.players[me]; const srcName = CARDS[ctx.item.sourceId]?.name ?? '';
  const once = (k: string, f: () => void) => { const dk = `once:${key}:${k}`; if (ctx.ans[dk]) return; f(); ctx.ans[dk] = true; };
  switch (e.kind) {
    case 'selfAway': ctx.item.awayTo = e.dest as 'bottom' | 'exile'; break;
    case 'cutDeal': once('d', () => { let k = 0; for (const o of opponents(g, me)) { if (o.library.length) { draw(g, o.id, 1); k++; log(g, `${o.name} draws a card.`); } } if (k) { draw(g, me, k); log(g, `${P.name} draws ${k} card${k > 1 ? 's' : ''}.`); } }); break;
    case 'frogs': once('x', () => { for (const c of onBf(g, refCards(g, ctx, 'tr:0-2'))) { const pid = ctl(c); exileCard(g, c); draw(g, pid, 1); log(g, `${g.players[pid].name} draws a card.`); } }); break;
    case 'avenge': once('x', () => { const all = g.players.flatMap(q => q.battlefield.filter(c => isType(c, 'Creature'))); for (const c of all) destroy(g, c); const k = all.filter(c => !findCard(g, c.uid)).length; gainLife(g, me, k); log(g, `${P.name} gains ${k} life.`); }); break;
    case 'retHero': once('x', () => { const c = refCards(g, ctx, 't0')[0]; if (!c || locate(g, c.uid)?.zone !== 'graveyard') return; moveCard(g, c, 'battlefield', { ctl: me }); if (findCard(g, c.uid) && isTypeOrSub(def(c), 'Hero')) { addCounters(g, c, '+1/+1', e.n as number); log(g, `${nm(c)} enters with ${e.n} additional +1/+1 counter${e.n === 1 ? '' : 's'}.`); } }); break;
    case 'westCoast': { const x = ctx.item.x ?? 0; once('d', () => { draw(g, me, x); log(g, `${P.name} draws ${x} card${x === 1 ? '' : 's'}.`); }); if (x < 5) break;
      const cands = P.hand.filter(c => isTypeOrSub(def(c), 'Hero') && !isType(c, 'Land')); if (!cands.length) break;
      const a = ask<number[]>(g, ctx, key + 'p', { pid: me, kind: 'pick', cards: cands, min: 0, max: 1, zone: 'hand', text: `${srcName}: you may cast a Hero spell from your hand without paying its mana cost.` });
      const c = cands.find(y => y.uid === a[0]); if (c) castNowStep(g, ctx, key + 'c', me, c, true); break; }
    case 'chaosWarp': once('x', () => { const c = onBf(g, refCards(g, ctx, 't0'))[0]; if (!c) return; const o = g.players[c.realOwner ?? c.owner]; moveCard(g, c, 'top', { quiet: true }); const i = o.library.indexOf(c); if (i >= 0) { o.library.splice(i, 1); o.library.push(c); } shuffle(g, o.library); log(g, `${nm(c)} is shuffled into ${o.name}'s library.`); const t = o.library[o.library.length - 1]; if (!t) return; log(g, `${o.name} reveals ${nm(t)}.`); if (isPermanentCard(def(t))) moveCard(g, t, 'battlefield', { ctl: o.id }); }); break;
    case 'nyami': { const t = P.library[P.library.length - 1]; if (!t) break; const k0 = `u:${key}`; if (!(k0 in ctx.ans)) ctx.ans[k0] = t.uid; const c = P.library.find(y => y.uid === ctx.ans[k0]); if (!c) break;
      const put = isPermanentCard(def(c)) && ask<boolean>(g, ctx, key, { pid: me, kind: 'may', text: `${srcName}: put ${nm(c)} onto the battlefield? (otherwise it goes to your hand)` });
      once('m', () => moveCard(g, c, put ? 'battlefield' : 'hand', { ctl: me })); break; }
    case 'genesis': case 'expressive': case 'wakanda': { const N = e.kind === 'genesis' ? 5 : e.kind === 'expressive' ? 3 : 6; const k0 = `u:${key}`; if (!(k0 in ctx.ans)) ctx.ans[k0] = P.library.slice(-N).map(c => c.uid);
      const cs = () => (ctx.ans[k0] as number[]).map(u => P.library.find(c => c.uid === u)).filter((c): c is Card => !!c);
      if (e.kind === 'genesis') { const perm = cs().filter(c => isPermanentCard(def(c))); const a = perm.length ? ask<number[]>(g, ctx, key, { pid: me, kind: 'pick', cards: perm, min: 0, max: perm.length, zone: 'library', text: `${srcName}: put any number of permanent cards onto the battlefield; the rest go to your hand.` }) : [];
        once('m', () => { for (const c of cs()) moveCard(g, c, a.includes(c.uid) ? 'battlefield' : 'hand', { ctl: me }); }); break; }
      if (e.kind === 'expressive') { const all = cs(); if (!all.length) break; const h = ask<number[]>(g, ctx, key, { pid: me, kind: 'pick', cards: all, min: 1, max: 1, zone: 'library', text: `${srcName}: put one into your hand.` });
        const r1 = all.filter(c => c.uid !== h[0]); const b = r1.length ? ask<number[]>(g, ctx, key + 'b', { pid: me, kind: 'pick', cards: r1, min: 1, max: 1, zone: 'library', text: `${srcName}: put one on the bottom of your library (the last is exiled; you may play it this turn).` }) : [];
        once('m', () => { for (const c of all) { if (c.uid === h[0]) moveCard(g, c, 'hand'); else if (c.uid === b[0]) moveCard(g, c, 'bottom'); else { moveCard(g, c, 'exile'); c.mayPlay = g.turn; } } }); break; }
      const all = cs(); const perm = all.filter(c => isPermanentCard(def(c)));
      const a = perm.length ? ask<number[]>(g, ctx, key, { pid: me, kind: 'pick', cards: perm, min: 0, max: 1, zone: 'library', text: `${srcName}: put a permanent card onto the battlefield with an indestructible counter.` }) : [];
      const r = perm.filter(c => c.uid !== a[0]); const b = r.length ? ask<number[]>(g, ctx, key + 'b', { pid: me, kind: 'pick', cards: r, min: 0, max: 1, zone: 'library', text: `${srcName}: you may put a permanent card into your hand.` }) : [];
      once('m', () => { for (const c of all) { if (c.uid === a[0]) { moveCard(g, c, 'battlefield', { ctl: me }); if (findCard(g, c.uid)) addCounters(g, c, 'indestructible', 1); } else moveCard(g, c, c.uid === b[0] ? 'hand' : 'graveyard'); } }); break; }
    case 'tchaka': { const cands = ctx.chosen.filter(c => locate(g, c.uid)?.zone === 'graveyard' && (isType(c, 'Artifact') || isType(c, 'Land'))); if (!cands.length) break;
      const a = ask<number[]>(g, ctx, key, { pid: me, kind: 'pick', cards: cands, min: 0, max: 1, zone: 'graveyard', text: `${srcName}: you may put an artifact or land card from among them into your hand.` });
      const c = cands.find(y => y.uid === a[0]); if (c) once('m', () => moveCard(g, c, 'hand')); break; }
    case 'titan': { const s = findCard(g, ctx.item.sourceUid); if (!s) break; const st = subtypes(def(s)); const all = hasKw(s, 'changeling') ? null : st;
      const k = P.battlefield.filter(c => c !== s && isType(c, 'Creature') && (all === null || hasKw(c, 'changeling') || all.some(t => isTypeOrSub(def(c), t)))).length; if (!k) break;
      if (!ask<boolean>(g, ctx, key, { pid: me, kind: 'may', text: `${srcName}: draw ${k} card${k > 1 ? 's' : ''}, then discard a card?` })) break;
      once('d', () => { draw(g, me, k); log(g, `${P.name} draws ${k}.`); }); runSub(g, ctx, [{ op: 'discard', n: 1, pl: 'you' }], key + 'x'); break; }
    case 'villain': { const vp = ctx.item.event?.player; if (vp === undefined) break; const V = g.players[vp]; const nt = V.battlefield.filter(c => isType(c, 'Creature') && !c.token);
      const sac = nt.length > 0 && ask<boolean>(g, ctx, key, { pid: vp, kind: 'may', text: `${srcName}: villainous choice — sacrifice a nontoken creature? (otherwise you lose 2 life and ${P.name} draws two cards)` });
      if (sac) { const a = ask<number[]>(g, ctx, key + 's', { pid: vp, kind: 'pick', cards: nt, min: 1, max: 1, zone: 'battlefield', text: 'Sacrifice a nontoken creature.' }); const c = nt.find(y => y.uid === a[0]); if (c) once('s', () => sacrifice(g, c)); }
      else once('l', () => { loseLife(g, vp, 2); draw(g, me, 2); log(g, `${V.name} loses 2 life; ${P.name} draws two cards.`); }); break; }
    case 'namor': { const s = findCard(g, ctx.item.sourceUid); if (!s || s.attacking === undefined) break; for (const c of P.battlefield) if (c !== s && c.attacking === s.attacking) c.pp += 2; log(g, `Other creatures attacking ${g.players[s.attacking].name} get +2/+0.`); break; }
    case 'alicia': once('x', () => { for (const q of g.players) for (const c of [...q.battlefield]) if (isType(c, 'Creature') && c.realOwner !== undefined && !g.players[c.realOwner].lost) changeControl(g, c, c.realOwner); g.steals = (g.steals ?? []).filter(s => findCard(g, s.uid) && ctl(findCard(g, s.uid)!) !== s.back); }); break;
    case 'discExile': { const c = ctx.item.evCard; if (!c || locate(g, c.uid)?.zone !== 'graveyard') break;
      if (!ask<boolean>(g, ctx, key, { pid: me, kind: 'may', text: `${srcName}: exile ${nm(c)} from your graveyard; you may play it ${e.until === 'yourNext' ? 'until the end of your next turn' : 'this turn'}?` })) break;
      once('x', () => { moveCard(g, c, 'exile'); const al = g.players.filter(q => !q.lost).map(q => q.id); const i = al.indexOf(me), j = al.indexOf(g.active); const k = i === j ? al.length : (i - j + al.length) % al.length; c.mayPlay = e.until === 'yourNext' ? g.turn + k : g.turn; }); break; }
    case 'glorious': { const s = findCard(g, ctx.item.sourceUid); const k0 = `u:${key}`;
      if (!(k0 in ctx.ans)) { if (!s) { ctx.ans[k0] = []; break; } sacrifice(g, s); const top = P.library.slice(-4); for (const c of top) moveCard(g, c, 'exile'); log(g, `${P.name} exiles the top four cards.`); ctx.ans[k0] = top.map(c => c.uid); }
      const ids = ctx.ans[k0] as number[]; for (let i = 0; i < ids.length; i++) { const c = P.exile.find(y => y.uid === ids[i]); if (c && !isType(c, 'Land')) castNowStep(g, ctx, `${key}:${i}`, me, c, true); }
      once('h', () => { for (const u of ids) { const c = P.exile.find(y => y.uid === u); if (c) moveCard(g, c, 'hand'); } }); break; }
    case 'photon': { const k0 = `n:${key}`; if (!(k0 in ctx.ans)) ctx.ans[k0] = ctx.item.event?.amount ?? 0; const n0 = ctx.ans[k0] as number; if (!n0) break;
      const col = ask<string>(g, ctx, key, { pid: me, kind: 'color', options: COLORS, text: `${srcName}: add ${n0} mana of any one color (kept until end of turn).` });
      once('m', () => { for (let i = 0; i < n0; i++) P.pool.push(`${col}@keep`); P.keepT = g.turn; log(g, `${P.name} adds ${n0} {${col}} (kept until end of turn).`); }); break; }
    case 'jail': once('x', () => { const c = onBf(g, refCards(g, ctx, 't0'))[0]; if (!c) return; exileCard(g, c); if (locate(g, c.uid)?.zone === 'exile') (g.jail ??= []).push({ uid: c.uid, by: me }); }); break;
    case 'torch': once('x', () => { const v = ctx.item.event?.player; const k = ctx.item.event?.amount ?? 0; if (v === undefined || !k || !opponents(g, me).some(o => o.id === v)) return; for (const o of opponents(g, me)) if (o.id !== v) { dealDamage(g, ctx.item.sourceId, findCard(g, ctx.item.sourceUid), { player: o.id }, k); } }); break;
    case 'sheHulk': once('x', () => { const c = ctx.item.evCard && findCard(g, ctx.item.evCard.uid); if (!c) return; const k = (c.blockedBy ?? []).filter(u => findCard(g, u)).length; if (k) addCounters(g, c, '+1/+1', k); }); break;
    case 'copyCtrs': once('x', () => { const s = findCard(g, ctx.item.sourceUid); const kd = ctx.item.event?.kind; const k = ctx.item.event?.amount ?? 0; if (s && kd && k) addCounters(g, s, kd, k); }); break;
    case 'gySelf': once('x', () => { const s = locate(g, ctx.item.sourceUid); if (!s || s.zone !== 'graveyard') return; if (e.dest === 'hand') { moveCard(g, s.c, 'hand'); log(g, `${nm(s.c)} returns to ${P.name}'s hand.`); return; }
      const cm = P.battlefield.find(x => x.attacking !== undefined && isCommander(g, x) && x.owner === me); moveCard(g, s.c, 'battlefield', { ctl: me }); const c = findCard(g, s.c.uid); if (c) { c.tapped = true; if (cm) c.attacking = cm.attacking; log(g, `${nm(c)} returns tapped and attacking.`); } }); break;
    case 'throne': once('x', () => { if (P.battlefield.some(x => isCommander(g, x) && x.owner === me)) becomeMonarch(g, me); }); break;
    case 'typhoid': { const L = ['Mary — create a Treasure token', 'Typhoid — draw a card', 'Bloody Mary — each opponent loses 2 life and you gain 2 life']; const k0 = `r:${key}`;
      if (!(k0 in ctx.ans)) ctx.ans[k0] = P.discT === g.turn ? -1 : Math.floor(rand(g) * 3);
      let m = ctx.ans[k0] as number; if (m < 0) m = L.indexOf(ask<string>(g, ctx, key, { pid: me, kind: 'color', options: L, text: `${srcName}: you discarded a card this turn — choose one.` }));
      else once('l', () => log(g, `${srcName}: randomly chose ${L[m]}.`));
      runSub(g, ctx, [[{ op: 'token', n: 1, tok: { name: 'Treasure', colors: [], types: ['Artifact'], preset: 'Treasure' } } as Effect], [{ op: 'draw', n: 1 } as Effect], [{ op: 'lose', n: 2, pl: 'opps' } as Effect, { op: 'gain', n: 2, pl: 'you' } as Effect]][m], key + 's'); break; }
    case 'kimoyo': { const s = findCard(g, ctx.item.sourceUid); if (!s) break; const L = ['AV Bead — draw a card', 'Communication Bead — two 1/1 Soldiers', 'Prime Bead — gain 3 life, blink'];
      const used = (s.chosenModes ??= []); const opts = L.filter((_, i) => !used.includes(i)); if (!opts.length) break;
      const m = L.indexOf(opts.length === 1 ? opts[0] : ask<string>(g, ctx, key, { pid: me, kind: 'color', options: opts, text: `${srcName}: choose one that hasn't been chosen.` }));
      once('u', () => used.push(m));
      if (m === 0) runSub(g, ctx, [{ op: 'draw', n: 1 }], key + 's'); else if (m === 1) runSub(g, ctx, [{ op: 'token', n: 2, tok: { name: 'Soldier', p: 1, t: 1, colors: ['W'], types: ['Creature'], sub: ['Soldier'] } }], key + 's');
      else once('p', () => { gainLife(g, me, 3); log(g, `${P.name} gains 3 life.`); exileCard(g, s); s.chosenModes = []; if (locate(g, s.uid)?.zone === 'exile') moveCard(g, s, 'battlefield', { ctl: s.owner }); }); break; }
    case 'tragic': { const keep: number[] = [];
      for (const q of g.players.filter(x => !x.lost)) for (const ty of ['Artifact', 'Creature', 'Enchantment', 'Planeswalker']) { const cs = q.battlefield.filter(c => isType(c, ty) && !isType(c, 'Land') && !keep.includes(c.uid)); if (!cs.length) continue;
        const a = cs.length === 1 ? [cs[0].uid] : ask<number[]>(g, ctx, `${key}:${q.id}:${ty}`, { pid: me, kind: 'pick', cards: cs, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: choose ${ty === 'Artifact' || ty === 'Enchantment' ? 'an' : 'a'} ${ty.toLowerCase()} ${q.name} keeps.` }); keep.push(a[0]); }
      once('x', () => { for (const q of g.players) for (const c of [...q.battlefield]) if (!isType(c, 'Land') && !keep.includes(c.uid)) sacrifice(g, c); }); break; }
    case 'promise': { const keep: number[] = [];
      for (const q of g.players.filter(x => !x.lost)) { const cs = creatures(q); if (!cs.length) continue; const a = cs.length === 1 ? [cs[0].uid] : ask<number[]>(g, ctx, `${key}:${q.id}`, { pid: q.id, kind: 'pick', cards: cs, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: choose a creature to keep (it gets a vow counter); sacrifice the rest.` }); keep.push(a[0]); }
      once('x', () => { for (const q of g.players) for (const c of creatures(q)) { if (keep.includes(c.uid)) { addCounters(g, c, 'vow', 1); c.vowVs = me; } else sacrifice(g, c); } }); break; }
    case 'willie': { const v = ctx.item.event?.player; if (v === undefined || !opponents(g, me).some(o => o.id === v)) break; once('d', () => { draw(g, me, 1); log(g, `${P.name} draws a card.`); });
      if (!ask<boolean>(g, ctx, key, { pid: v, kind: 'may', text: `${srcName}: draw a card? If you do, you can't attack ${P.name} during your next turn.` })) break;
      once('o', () => { draw(g, v, 1); const al = g.players.filter(q => !q.lost).map(q => q.id); const i = al.indexOf(v), j = al.indexOf(g.active); const k = i === j ? al.length : (i - j + al.length) % al.length; (g.players[v].noAtkVs ??= []).push({ pid: me, t: g.turn + k }); log(g, `${g.players[v].name} draws a card and can't attack ${P.name} next turn.`); }); break; }
    case 'surfer': once('x', () => { const v = ctx.item.event?.player; const c = onBf(g, refCards(g, ctx, 't0'))[0]; if (v === undefined || !c) return; const al = g.players.filter(q => !q.lost).map(q => q.id); const i = al.indexOf(me), j = al.indexOf(g.active); const k = i === j ? al.length : (i - j + al.length) % al.length; c.mustAtk = { pid: v, t: g.turn + k }; log(g, `${nm(c)} must attack ${g.players[v].name} each combat until the end of ${P.name}'s next turn.`); }); break;
    case 'galvanic': once('x', () => { (g.nextIS ??= []).push({ pid: me, turn: g.turn, sourceId: ctx.item.sourceId, sourceUid: ctx.item.sourceUid }); }); break;
    case 'crucibleMana': { const cols: string[] = []; for (let i = 0; i < 4; i++) cols.push(ask<string>(g, ctx, `${key}:${i}`, { pid: me, kind: 'color', options: COLORS, text: `${srcName}: choose the color of mana ${i + 1} of 4.` })); once('m', () => { P.pool.push(...cols); log(g, `${P.name} adds ${cols.map(c => `{${c}}`).join('')}.`); }); break; }
    case 'copySame': case 'copySpell': case 'copySpellOnce': case 'copySpellCmd': { const sc = ctx.item.evCard; const orig = g.stack.find(s => s.kind === 'spell' && !!s.card && !!sc && s.card.uid === sc.uid); if (!orig || !orig.card) break;
      if (e.kind === 'copySame') { once('c', () => { const card: Card = { ...orig.card!, uid: g.nextUid++, isCopy: true, token: isPermanentCard(def(orig.card!)) ? true : orig.card!.token }; g.stack.push({ ...orig, id: g.nextUid++, controller: me, card, label: `copy of ${orig.label}` }); log(g, `${P.name} copies ${nm(orig.card!)}.`); }); break; }
      if (e.kind === 'copySpellOnce') { const s = findCard(g, ctx.item.sourceUid); if (!s || (s.copyT === g.turn && !ctx.ans[`t:${key}`])) break; if (!ask<boolean>(g, ctx, key + 'm', { pid: me, kind: 'may', text: `${srcName}: copy ${nm(orig.card)}? (only once each turn)` })) break; once('t', () => { s.copyT = g.turn; ctx.ans[`t:${key}`] = true; }); }
      const N = e.kind === 'copySpellCmd' ? P.commanderIds.reduce((s, id) => s + (P.casts[id] ?? 0), 0) : 1; const slots = orig.tslots ?? (orig.targetSpec ? [slotOf(orig.targetSpec)] : []); const ts0 = orig.targets ?? (orig.target ? [orig.target] : []);
      for (let i = 0; i < N; i++) {
        const nts = ts0.map((t, j) => { if (!t || t.card === undefined || !slots[j]) return t; const cands = legalTargets(g, me, slots[j]).map(x => x.card !== undefined ? locate(g, x.card)?.c : undefined).filter((c): c is Card => !!c); if (cands.length <= 1) return t;
          cands.sort((a, b) => (a.uid === t.card ? 1 : 0) - (b.uid === t.card ? 1 : 0)); const cur = locate(g, t.card)?.c;
          const a = ask<number[]>(g, ctx, `${key}:${i}:${j}`, { pid: me, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'any', text: `Choose a target for the copy of ${nm(orig.card!)}${cur ? ` (the original targets ${nm(cur)})` : ''}.` }); return { card: a[0] } as Target; });
        once(`c${i}`, () => { const card: Card = { ...orig.card!, uid: g.nextUid++, isCopy: true, token: isPermanentCard(def(orig.card!)) ? true : orig.card!.token }; g.stack.push({ ...orig, id: g.nextUid++, controller: me, card, targets: nts, target: nts.find(Boolean), label: `copy of ${orig.label}` }); log(g, `${P.name} copies ${nm(orig.card!)}.`); });
      } break; }
    case 'copyTrigMay': { const orig = g.stack.find(s => s.inst === e.n && s.kind === 'trigger'); if (!orig) break;
      if (!ask<boolean>(g, ctx, key, { pid: me, kind: 'may', text: `${srcName}: copy "${orig.label}"?` })) break;
      const slots = orig.tslots ?? []; const ts0 = orig.targets ?? [];
      const change = ts0.some(Boolean) && ask<boolean>(g, ctx, key + ':n', { pid: me, kind: 'may', text: `${srcName}: choose new targets for the copy?` });
      const nts = !change ? ts0 : ts0.map((t, j) => { if (!t || !slots[j]) return t; const cands = legalTargets(g, me, slots[j]).map(x => x.card !== undefined ? locate(g, x.card)?.c : undefined).filter((c): c is Card => !!c); if (cands.length <= 1 && t.card !== undefined) return t;
        if (t.card !== undefined && cands.length) { const a = ask<number[]>(g, ctx, `${key}:t${j}`, { pid: me, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'any', text: `Choose a new target for the copy.` }); return { card: a[0] } as Target; } return t; });
      once('c', () => { g.stack.push({ ...orig, id: g.nextUid++, controller: me, targets: nts, target: nts.find(Boolean), inst: undefined, label: `copy of ${orig.label}` }); log(g, `${P.name} copies "${orig.label}".`); }); break; }
    case 'copyTrig': { const t0 = ctx.item.targets?.[0] ?? ctx.item.target; const orig = g.stack.find(s => s.id === t0?.stack && s.kind === 'trigger' && s.controller === me); if (!orig) break;
      const slots = orig.tslots ?? []; const ts0 = orig.targets ?? (orig.target ? [orig.target] : []);
      for (let i = 0; i < 2; i++) {
        const nts = ts0.map((t, j) => { if (!t || t.card === undefined || !slots[j]) return t; const cands = legalTargets(g, me, slots[j]).map(x => x.card !== undefined ? locate(g, x.card)?.c : undefined).filter((c): c is Card => !!c); if (cands.length <= 1) return t;
          cands.sort((a, b) => (a.uid === t.card ? 1 : 0) - (b.uid === t.card ? 1 : 0)); const cur = locate(g, t.card)?.c;
          const a = ask<number[]>(g, ctx, `${key}:${i}:${j}`, { pid: me, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'any', text: `Choose a target for copy ${i + 1} of "${orig.label}"${cur ? ` (the original targets ${nm(cur)})` : ''}.` }); return { card: a[0] } as Target; });
        once(`c${i}`, () => { g.stack.push({ ...orig, id: g.nextUid++, targets: nts, target: nts.find(Boolean), label: `copy of ${orig.label}` }); log(g, `${P.name} copies "${orig.label}".`); });
      } break; }
    case 'laser': once('x', () => { const s = findCard(g, ctx.item.sourceUid); if (!s) return; const k = P.discT === g.turn ? P.discN ?? 0 : 0; for (let i = 0; i < k; i++) tokenCopyAtk(g, ctx, me, s, s, { end: 'exile' }); }); break;
    case 'loki': once('x', () => { const s = findCard(g, ctx.item.sourceUid); const t = onBf(g, refCards(g, ctx, 't0'))[0]; if (!t) return; tokenCopyAtk(g, ctx, me, t, s, { addSub: 'Illusion', end: 'sac' }); }); break;
    case 'folkHero': once('x', () => { const sc = ctx.item.evCard; if (!sc) return; const st = subtypes(def(sc)); if (!st.length) return;
      for (const c of P.battlefield) if (c.owner === me && isType(c, 'Creature') && isCommander(g, c) && c.folkT !== g.turn && subtypes(def(c)).some(x => st.includes(x) && !['Equipment', 'Aura'].includes(x))) { c.folkT = g.turn; draw(g, me, 1); log(g, `${nm(c)} (Folk Hero): ${P.name} draws a card.`); } }); break;
    case 'heroic': once('x', () => { const c = onBf(g, refCards(g, ctx, 't0'))[0]; if (!c) return; g.redirect = { pid: me, uid: c.uid, turn: g.turn }; log(g, `Until end of turn, damage to ${P.name} and their creatures is dealt to ${nm(c)} instead.`);
      (g.watch ??= []).push({ uid: c.uid, ev: 'dies', controller: me, sourceId: ctx.item.sourceId, sourceUid: ctx.item.sourceUid, label: 'put its counters on up to one creature you control and draw a card', effects: [{ op: 'script', kind: 'heroicDies' } as Effect], until: 'eot', by: me }); }); break;
    case 'heroicDies': { const dc = ctx.item.evCard; const cs = Object.entries(dc?.lastCtrs ?? dc?.counters ?? {}).filter(([, v]) => v > 0); const cands = creatures(P);
      if (cs.length && cands.length) { const a = ask<number[]>(g, ctx, key, { pid: me, kind: 'pick', cards: cands, min: 0, max: 1, zone: 'battlefield', text: `${srcName}: put ${nm(dc!)}'s counters on up to one creature you control.` }); once('c', () => { const t = cands.find(x => x.uid === a[0]); if (t) for (const [k, v] of cs) addCounters(g, t, k, v); }); }
      once('d', () => { draw(g, me, 1); log(g, `${P.name} draws a card.`); }); break; }
    case 'archEnter': { const c = ctx.item.card; if (!c) break; const os = opponents(g, me); if (!os.length) break; const nmz = os.map(o => o.name);
      const pick = os.length === 1 ? nmz[0] : P.human ? ask<string>(g, ctx, key, { pid: me, kind: 'color', options: nmz, text: `${srcName}: choose an opponent to enchant.` }) : [...os].sort((a, b) => b.life - a.life)[0].name;
      c.encP = os[Math.max(0, nmz.indexOf(pick))].id; log(g, `${nm(c)} enchants ${pick}.`); break; }
    case 'archAtk': once('x', () => { const s = findCard(g, ctx.item.sourceUid); if (!s || s.encP === undefined || !attackers(g).some(a => a.attacking === s.encP)) return; loseLife(g, s.encP, 2); draw(g, me, 1); gainLife(g, me, 2); log(g, `${g.players[s.encP].name} loses 2 life; ${P.name} draws a card and gains 2 life.`); }); break;
    case 'archMove': { const s = findCard(g, ctx.item.sourceUid); const v = ctx.item.event?.player; if (!s || v === undefined || v === me || s.encP === v || !attackers(g).some(a => a.attacking === me)) break;
      if (!ask<boolean>(g, ctx, key, { pid: me, kind: 'may', text: `${srcName}: attach it to ${g.players[v].name}?` })) break; once('x', () => { s.encP = v; log(g, `${nm(s)} now enchants ${g.players[v].name}.`); }); break; }
    case 'blackBolt': { const v = ctx.item.event?.player; if (v === undefined || v === me) break; const cands = g.players[v].battlefield.filter(c => !isType(c, 'Land') && !hasKw(c, 'hexproof') && !hasKw(c, 'shroud')); if (!cands.length) break;
      const a = P.human ? ask<number[]>(g, ctx, key, { pid: me, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: destroy target nonland permanent ${g.players[v].name} controls.` }) : [[...cands].sort((x, y) => cmc(def(y)) - cmc(def(x)))[0].uid];
      once('x', () => { const t = cands.find(x => x.uid === a[0]); if (t && findCard(g, t.uid)) destroy(g, t); }); break; }
    case 'jewel': once('x', () => { const j = findCard(g, ctx.item.sourceUid); const v = ctx.item.event?.player; if (!j || v === undefined) return; draw(g, v, 3); changeControl(g, j, v); j.tapped = false; log(g, `${g.players[v].name} draws three cards and gains control of ${nm(j)}.`); }); break;
    case 'witch': { const s = findCard(g, ctx.item.sourceUid) ?? locate(g, ctx.item.sourceUid)?.c; if (!s) break;
      once('e', () => { const cs = P.library.splice(Math.max(0, P.library.length - 2), 2); for (const c of cs) { c.exBy = s.uid; P.exile.push(c); } log(g, `${P.name} exiles the top ${cs.length} cards of their library face down.`); });
      const cands = P.exile.filter(x => x.exBy === s.uid && !isType(x, 'Land') && (!isType(x, 'Creature') || subtypes(def(x)).includes('Hero'))); if (!cands.length) break;
      const a = ask<number[]>(g, ctx, key, { pid: me, kind: 'pick', cards: cands, min: 0, max: 1, zone: 'exile', text: `${srcName}: you may cast a Hero or noncreature spell from among cards exiled with it without paying its mana cost.` });
      const c = cands.find(x => x.uid === a[0]); if (c) castNowStep(g, ctx, `${key}:cast`, me, c, true); break; }
    case 'gift': once('x', () => { const dc = ctx.item.evCard; if (!dc) return; const l = locate(g, dc.uid); if (!l || l.zone !== 'graveyard') return; moveCard(g, dc, 'battlefield', { ctl: dc.owner }); addDelayed(g, ctx, { at: 'endStep', label: 'return Gift of Immortality attached to that creature', effects: [{ op: 'script', kind: 'giftBack', n: dc.uid } as Effect] }); }); break;
    case 'giftBack': once('x', () => { const l = locate(g, ctx.item.sourceUid); const t = findCard(g, e.n as number); if (!l || l.zone !== 'graveyard' || !t) return; moveCard(g, l.c, 'battlefield'); l.c.attachedTo = t.uid; log(g, `${nm(l.c)} returns attached to ${nm(t)}.`); }); break;
    case 'conduit': { const done = `${key}:cast` in ctx.ans; let c: Card | undefined;
      if (!done) { const t = ctx.item.targets?.[0]; const l = t?.card !== undefined ? locate(g, t.card) : undefined; if (!l || l.zone !== 'graveyard' || (P.spells?.turn === g.turn && P.spells.n > 0)) break; c = l.c; c.mayPlay = g.turn; }
      const cast = done ? !!ctx.ans[`${key}:cast`] : castNowStep(g, ctx, `${key}:cast`, me, c!, false); if (cast) once('n', () => { P.noCastT = g.turn; log(g, `${P.name} can't cast additional spells this turn.`); }); else if (c) delete c.mayPlay; break; }
    case 'thingDbl': { const cands = P.battlefield.filter(x => Object.values(x.counters ?? {}).some(v => v > 0)); if (!cands.length) break;
      const a = P.human ? ask<number[]>(g, ctx, key, { pid: me, kind: 'pick', cards: cands, min: 0, max: cands.length, zone: 'battlefield', text: `${srcName}: double the counters on any number of target permanents you control.` }) : cands.filter(x => !Object.keys(x.counters ?? {}).some(k => k === '-1/-1')).map(x => x.uid);
      once('x', () => { for (const c of cands.filter(x => a.includes(x.uid))) for (const [k, v] of Object.entries(c.counters ?? {})) if (v > 0) addCounters(g, c, k, v); }); break; }
    case 'ppack': once('x', () => { const is = P.graveyard.filter(x => isType(x, 'Instant') || isType(x, 'Sorcery')); if (!is.length) return; const c = is[Math.floor(rand(g) * is.length)]; moveCard(g, c, 'exile'); c.exBy = ctx.item.sourceUid; log(g, `${P.name} exiles ${nm(c)} (chosen at random).`);
      addDelayed(g, ctx, { at: 'upkeep', pid: me, label: `you may cast ${nm(c)} without paying its mana cost`, effects: [{ op: 'script', kind: 'ppCast', n: c.uid } as Effect] }); }); break;
    case 'ppCast': { const c = P.exile.find(x => x.uid === e.n); if (!c) break; c.exileAfter = true; const cast = castNowStep(g, ctx, `${key}:cast`, me, c, true); if (!cast) delete c.exileAfter; break; }
    case 'dilation': { const v = ctx.item.event?.player; if (v === undefined || v === me) break; const O = g.players[v];
      once('e', () => { const c = O.library.pop(); if (!c) return; O.exile.push(c); log(g, `${O.name} exiles ${nm(c)} from the top of their library.`); if (!isType(c, 'Land')) ctx.ans[`dil:${key}`] = c.uid as never; });
      const uid = ctx.ans[`dil:${key}`] as unknown as number | undefined; if (uid === undefined) break; const c = O.exile.find(x => x.uid === uid) ?? P.exile.find(x => x.uid === uid); if (!c) break;
      once('m', () => { O.exile = O.exile.filter(x => x !== c); if (!P.exile.includes(c)) P.exile.push(c); });
      const cast = castNowStep(g, ctx, `${key}:cast`, me, c, true); if (!cast) once('b', () => { if (P.exile.includes(c)) { P.exile = P.exile.filter(x => x !== c); O.exile.push(c); } }); break; }
    case 'extract': once('x', () => { for (const q of alive(g)) { const c = q.library.pop(); if (!c) continue; P.exile.push(c); Object.assign(c, { mayPlay: 1e9, playFree: true, playBy: me }); } log(g, `${P.name} exiles the top card of each player's library face down; they may play them for free while they remain exiled.`); }); break;
    case 'zemo': { const s = findCard(g, ctx.item.sourceUid); const done = `${key}:cast` in ctx.ans; let c: Card | undefined;
      if (!done) { const t = ctx.item.targets?.[0]; const l = t?.card !== undefined ? locate(g, t.card) : undefined; if (!s || !l || l.zone !== 'graveyard' || cmc(def(l.c)) > power(g, s)) break; c = l.c; c.mayPlay = g.turn; c.exileAfter = true; }
      const cast = done ? !!ctx.ans[`${key}:cast`] : castNowStep(g, ctx, `${key}:cast`, me, c!, false); if (cast) { if (s) once('c', () => addCounters(g, s, '+1/+1', 1)); } else if (c) { delete c.mayPlay; delete c.exileAfter; } break; }
    case 'klaw': once('x', () => { const v = ctx.item.event?.player; if (v === undefined || v === me) return; const c = g.players[v].library.pop(); if (!c) return; P.exile.push(c); Object.assign(c, { mayPlay: 1e9, anyMana: true, playBy: me }); log(g, `${P.name} exiles the top card of ${g.players[v].name}'s library face down (may play it; any mana).`); }); break;
    case 'ladyLoki': { const sc = ctx.item.evCard; if (!sc || P.ladyT === g.turn) break; const d0 = def(sc); if (!(d0.types.includes('Instant') || d0.types.includes('Sorcery') || subtypes(d0).includes('Villain'))) break;
      once('e', () => { P.ladyT = g.turn; const i = g.stack.findIndex(s => s.kind === 'spell' && s.card?.uid === sc.uid); if (i >= 0) { g.stack.splice(i, 1); frontFace(sc); g.players[sc.owner].exile.push(sc); log(g, `${nm(sc)} is exiled.`); }
        let c: Card | undefined; while ((c = P.library.pop())) { P.exile.push(c); log(g, `${P.name} exiles ${nm(c)}.`); if (!isType(c, 'Land')) break; }
        if (c) { const k = Math.abs(cmc(d0) - cmc(def(c))); const s = findCard(g, ctx.item.sourceUid); for (const o of opponents(g, me)) dealDamage(g, ctx.item.sourceId, s, { player: o.id }, k); ctx.ans[`ll:${key}`] = c.uid as never; } });
      const uid = ctx.ans[`ll:${key}`] as unknown as number | undefined; const c = uid !== undefined ? P.exile.find(x => x.uid === uid) : undefined; if (c) castNowStep(g, ctx, `${key}:cast`, me, c, true); break; }
    case 'stilt': once('x', () => { const v = ctx.item.event?.player; const c = onBf(g, refCards(g, ctx, 't0'))[0]; if (!c || v === undefined || ctl(c) !== v) return; const t = g.turn + alive(g).length; changeControl(g, c, me); (g.steals ??= []).push({ uid: c.uid, back: v, t }); c.noSacT = t; log(g, `${P.name} gains control of ${nm(c)} until the end of their next turn.`); }); break;
    case 'scheme': { const s = ctx.item.card; const conv = (s?.convokedBy ?? []).map(u => findCard(g, u)).filter((x): x is Card => !!x);
      for (const [i, c] of conv.entries()) { once(`d${i}`, () => { draw(g, ctl(c), 1); log(g, `${nm(c)} connives.`); }); const H = g.players[ctl(c)]; if (!H.hand.length) continue;
        const a = H.human ? ask<number[]>(g, ctx, `${key}:${i}`, { pid: H.id, kind: 'pick', cards: H.hand, min: 1, max: 1, zone: 'hand', text: `${nm(c)} connives: discard a card.` }) : [([...H.hand].sort((x, y) => (isType(y, 'Land') ? 1 : 0) - (isType(x, 'Land') ? 1 : 0) || cmc(def(x)) - cmc(def(y))))[0].uid];
        once(`x${i}`, () => { const dc = H.hand.find(x => x.uid === a[0]); if (!dc) return; discardCard(g, dc); if (!isType(dc, 'Land')) addCounters(g, c, '+1/+1', 1); }); } break; }
    case 'ccExile': { const dc = ctx.item.evCard; const s = findCard(g, ctx.item.sourceUid); if (!dc || !s || !P.graveyard.includes(dc)) break; if (!ask<boolean>(g, ctx, key, { pid: me, kind: 'may', text: `${srcName}: exile ${nm(dc)} from your graveyard?` })) break; once('x', () => { moveCard(g, dc, 'exile'); dc.exBy = s.uid; }); break; }
    case 'ccUse': { const s = findCard(g, ctx.item.sourceUid); if (!s) break; const cands = g.players.flatMap(q => q.exile.filter(x => x.exBy === s.uid)); if (!cands.length) break;
      const a = ask<number[]>(g, ctx, key, { pid: me, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'exile', text: `${srcName}: put a card exiled with it into its owner's graveyard.` });
      once('x', () => { const c = cands.find(x => x.uid === a[0]); if (!c) return; delete c.exBy; moveCard(g, c, 'graveyard'); log(g, `${nm(c)} is put into ${g.players[c.owner].name}'s graveyard.`);
        createToken(g, me, isType(c, 'Land') ? { name: 'Treasure', colors: [], types: ['Artifact'], preset: 'Treasure' } as TokenSpec : { name: 'Rogue', p: 2, t: 2, colors: ['B'], types: ['Creature'], sub: ['Rogue'] }); }); break; }
    case 'icon': once('x', () => { const s = findCard(g, ctx.item.sourceUid); if (!s?.chosenType) return; P.flashT = { type: s.chosenType, turn: g.turn }; log(g, `The next ${s.chosenType} spell ${P.name} casts this turn has flash.`); }); break;
    case 'sfoes': { const s = findCard(g, ctx.item.sourceUid); if (!s || !P.library.length) break; if (!ask<boolean>(g, ctx, key, { pid: me, kind: 'may', text: `${srcName}: exile the top card of your library?` })) break;
      once('x', () => { for (const q of g.players) for (const x of q.exile) if (x.exBy === s.uid) { delete x.mayPlay; delete x.exBy; } const c = P.library.pop()!; P.exile.push(c); c.exBy = s.uid; c.mayPlay = 1e9; log(g, `${P.name} exiles ${nm(c)}; they may play it until they exile another card with ${nm(s)}.`); }); break; }
    case 'phaseT': once('x', () => { for (const t of ctx.item.targets ?? []) { const c = t?.card !== undefined ? findCard(g, t.card) : undefined; if (c) phaseOut(g, c); } }); break;
    case 'vision': { const v = ctx.item.event?.player; if (v === undefined || v === g.active) break; const s = findCard(g, ctx.item.sourceUid); if (!s) break;
      const L = ['Put a +1/+1 counter on Vision', 'Vision phases out']; const m = L.indexOf(ask<string>(g, ctx, key, { pid: me, kind: 'color', options: L, text: `${srcName}: choose one.` }));
      once('x', () => { if (m === 1) phaseOut(g, s); else addCounters(g, s, '+1/+1', 1); }); break; }
    case 'suspendCast': { const c = P.exile.find(x => x.uid === ctx.item.sourceUid && x.suspended && !(x.counters?.time)); if (!c) break; if (isType(c, 'Creature')) c.susHaste = true;
      const cast = castNowStep(g, ctx, `${key}:cast`, me, c, true); if (!cast) { delete c.susHaste; delete c.suspended; } break; }
    case 'suspendT0': once('x', () => { const t = ctx.item.targets?.[0]; const l = t?.card !== undefined ? locate(g, t.card) : undefined; if (!l || l.zone !== 'graveyard') return; moveCard(g, l.c, 'exile'); suspendCard(g, l.c, 2); }); break;
    case 'kang': once('x', () => { let c: Card | undefined; while ((c = P.library.pop())) { P.exile.push(c); log(g, `${P.name} exiles ${nm(c)}.`); if (!isType(c, 'Land')) break; } if (c) suspendCard(g, c, 2); }); break;
    case 'miracle': { const c = P.hand.find(x => x.uid === e.n); if (!c) break; castNowStep(g, ctx, `${key}:cast`, me, c, true); break; }
    case 'nzpTag': once('x', () => { const t = ctx.item.targets?.[0]; const l = t?.card !== undefined ? locate(g, t.card) : undefined; if (l && l.zone === 'exile') { l.c.exBy = ctx.item.sourceUid; if (isType(l.c, 'Creature')) { draw(g, me, 1); log(g, `${P.name} draws a card.`); } } }); break;
    case 'nzpFlip': once('x', () => { const s = findCard(g, ctx.item.sourceUid); if (!s) return; const ex = g.players.flatMap(q => q.exile.filter(x => x.exBy === s.uid)); if (ex.filter(x => isType(x, 'Creature')).length < 4) return;
      const won = rand(g) < 0.5; log(g, `${P.name} flips a coin and ${won ? 'wins' : 'loses'} the flip.`); if (won) return; moveCard(g, s, 'graveyard'); log(g, `${P.name} sacrifices ${nm(s)}.`);
      const c = ex[Math.floor(rand(g) * ex.length)]; delete c.exBy; moveCard(g, c, 'hand'); log(g, `${nm(c)} returns to ${g.players[c.owner].name}'s hand.`); }); break;
    case 'kickCtr': { const c = ctx.item.card; if (c && c.x) c.enterCtr = { kind: '+1/+1', n: c.x }; break; }
    case 'batroc': once('x', () => { const s = findCard(g, ctx.item.sourceUid); if (!s) return; const k = power(g, s); for (const t of (ctx.item.targets ?? []).slice(0, s.x ?? 0)) { if (!t) continue; if (t.player !== undefined) dealDamage(g, s.id, s, { player: t.player }, k); else if (t.card !== undefined) { const c = findCard(g, t.card); if (c) dealDamage(g, s.id, s, { card: c }, k); } } }); break;
    case 'tpCounters': once('x', () => { const t = (ctx.item.targets ?? []).find(x => x?.player !== undefined); if (!t) return; for (const c of creatures(g.players[t.player!])) addCounters(g, c, '+1/+1', 1); }); break;
    case 'enterPerm': once('x', () => { const c = ctx.item.card; if (!c) return; ctx.item.card = undefined; c.wasCast = true; enter(g, c, me, {}); const ec = c.enterCtr; delete c.enterCtr; if (ec && findCard(g, c.uid)) { if (ec.kind === 'loyalty') c.counters = { ...(c.counters ?? {}), loyalty: ctr(c, 'loyalty') + ec.n }; else addCounters(g, c, ec.kind, ec.n); } }); break;
    case 'clone': case 'cloneSpark': { const s = ctx.item.card; if (!s || s.origId) break; const spark = e.kind === 'cloneSpark';
      const cands = P.battlefield.filter(c => c !== s && (isType(c, 'Creature') || (spark && isType(c, 'Planeswalker')))); if (!cands.length) break;
      const a = ask<number[]>(g, ctx, key, { pid: me, kind: 'pick', cards: cands, min: 0, max: 1, zone: 'battlefield', text: `${srcName}: you may have it be a copy of a ${spark ? 'creature or planeswalker' : 'creature'} you control.` });
      const t = cands.find(c => c.uid === a[0]); if (!t) break;
      once('x', () => { const nm0 = def(s).name; becomeCopy(g, s, t, spark ? { nonlegendary: true } : { name: nm0 }); if (spark) s.enterCtr = isType(t, 'Planeswalker') && !isType(t, 'Creature') ? { kind: 'loyalty', n: 1 } : { kind: '+1/+1', n: 1 }; }); break; }
    case 'mirage': once('x', () => { const s = findCard(g, ctx.item.sourceUid); const t = onBf(g, refCards(g, ctx, 't0'))[0]; if (s && t) becomeCopy(g, s, t, { eot: true }); }); break;
    case 'herb': { const cands = creatures(P); if (!cands.length) break;
      const a = ask<number[]>(g, ctx, key, { pid: me, kind: 'pick', cards: cands, min: 0, max: 1, zone: 'battlefield', text: `${srcName}: you may sacrifice a creature. If you do, it returns with three +1/+1 counters and you become the monarch.` });
      const c = cands.find(x => x.uid === a[0]); if (!c) break;
      once('s', () => { log(g, `${P.name} sacrifices ${nm(c)}.`); sacrifice(g, c); const l = locate(g, c.uid); if (l && l.zone === 'graveyard') { moveCard(g, c, 'battlefield'); addCounters(g, c, '+1/+1', 3); log(g, `${nm(c)} returns to the battlefield with three +1/+1 counters.`); } becomeMonarch(g, me); }); break; }
  }
}
/** Path of Ancestry: mana spent on a creature spell sharing a creature type with your commander → scry 1 (one trigger per such mana). */
function pathScry(g: Game, pid: number, plan: Payment, d: CardDef) {
  const n = (plan.tags ?? []).filter(t => t.startsWith('path')).length; if (!n || !d.types.includes('Creature')) return;
  const P = g.players[pid]; const cmd = P.commanderIds.map(id => CARDS[id]).filter(Boolean); const mine = new Set(subtypes(d));
  if (!cmd.some(cd => cd.types.includes('Creature') && subtypes(cd).some(t => mine.has(t)))) return;
  const src = plan.srcs.find((c, k) => def(c).mana?.[plan.abs?.[k] ?? 0]?.only === 'path') ?? plan.srcs[0];
  for (let k = 0; k < n; k++) g.pending.push({ controller: pid, sourceId: src?.id ?? 'path', sourceUid: src?.uid ?? -1, trig: { on: 'x', label: 'Path of Ancestry — scry 1.', effects: [{ op: 'scry', n: 1 }] }, event: { player: pid } });
}
/** Record a permanent's chosen creature type ('~ is the chosen type in addition to its other types' too). */
function setChosen(g: Game, c: Card, ty: string) { c.chosenType = ty; if (def(c).addChosen || CARDS[c.id]?.addChosen) { g.ces = (g.ces ?? []).filter(x => !(x.uid === c.uid && x.chosen)); (g.ces ??= []).push({ ts: nextTs(g), uid: c.uid, until: 'perm', by: ctl(c), addSub: [ty], chosen: true } as CE); layer(g); } }
/** The monarch designation (rule 724). */
export function becomeMonarch(g: Game, pid: number) { if (g.monarch === pid || g.players[pid].lost) return; g.monarch = pid; log(g, `${g.players[pid].name} ${pid === 0 ? 'become' : 'becomes'} the monarch.`); emit(g, 'becameMonarch', { player: pid });
  for (const j of [...(g.jail ?? [])]) if (j.by !== pid) { g.jail = g.jail!.filter(x => x !== j); const l = locate(g, j.uid); if (l?.zone === 'exile') { log(g, `${nm(l.c)} returns from exile (an opponent became the monarch).`); moveCard(g, l.c, 'battlefield', { ctl: l.c.owner }); } } }
const MONARCH_SRC = 'monarch';
CARDS[MONARCH_SRC] ??= { id: MONARCH_SRC, name: 'The Monarch', types: [], cost: { generic: 0 }, colors: [], text: 'At the beginning of the monarch\'s end step, that player draws a card. Whenever a creature deals combat damage to the monarch, its controller becomes the monarch.' };
function monarchTrig(g: Game, pid: number, label: string, effects: Effect[]) { g.pending.push({ controller: pid, sourceId: MONARCH_SRC, sourceUid: -1, trig: { on: 'x', label, effects }, event: { player: pid } }); }
/** Every creature type that could matter in this game, most common among pid's cards first. */
export function typeOptions(g: Game, pid: number): string[] {
  const cnt = new Map<string, number>(); const bump = (t: string, w: number) => cnt.set(t, (cnt.get(t) ?? 0) + w);
  for (const q of g.players) for (const z of [q.library, q.hand, q.battlefield, q.graveyard, q.exile, q.command]) for (const c of z) { const d = def(c); if (!d.types.includes('Creature') && !d.types.includes('Kindred')) continue; for (const t of subtypes(d)) bump(t, q.id === pid ? 1000 : 1); }
  return [...cnt.keys()].sort((a, b) => cnt.get(b)! - cnt.get(a)! || a.localeCompare(b));
}
/** AI's creature-type choice: 'mine' = most common among its cards; 'keep' = most (own - opponents') creatures on the battlefield. */
export function aiType(g: Game, pid: number, opts: string[], mode: 'mine' | 'keep' = 'mine'): string {
  if (mode === 'keep') { const sc = (t: string) => g.players.reduce((s, q) => s + creatures(q).filter(c => isTypeOrSub(def(c), t)).reduce((a, c) => a + (q.id === pid ? 1 : -1) * (1 + cmc(def(c)) / 4), 0), 0); return [...opts].sort((a, b) => sc(b) - sc(a))[0] ?? 'Human'; }
  return opts[0] ?? 'Human';
}
function chooseTypeAsk(g: Game, ctx: ResCtx, key: string, pid: number, mode: 'mine' | 'keep'): string { const opts = typeOptions(g, pid); if (!opts.length) opts.push('Human'); return ask<string>(g, ctx, key, { pid, kind: 'ctype', options: opts, mode, text: 'Choose a creature type.' }); }
function runSub(g: Game, ctx: ResCtx, subs: Effect[] | undefined, key: string) {
  (subs ?? []).forEach((s, i) => { const k = `${key}.${i}`; if (ctx.ans[`done:${k}`]) return; exec(g, ctx, s, k); ctx.ans[`done:${k}`] = true; });
}
function addDelayed(g: Game, ctx: ResCtx, d: { at: 'endStep' | 'upkeep'; pid?: number; label: string; effects: Effect[] }) {
  (g.delayed ??= []).push({ ...d, turnAfter: g.step === 'end' || g.step === 'cleanup' ? g.turn : g.turn - 1, controller: ctx.item.controller, sourceId: ctx.item.sourceId, sourceUid: ctx.item.sourceUid });
}
/** Delayed triggered abilities ("at the beginning of the next end step"). */
/** Phasing: the permanent (and what's attached to it) is treated as though it doesn't exist until its controller's next turn. */
export function phaseOut(g: Game, c: Card) {
  const pid = ctl(c); const grp = [c, ...g.players.flatMap(q => q.battlefield.filter(x => x.attachedTo === c.uid))];
  for (const x of grp) { const q = g.players[ctl(x)]; const i = q.battlefield.indexOf(x); if (i < 0) continue; q.battlefield.splice(i, 1); delete x.attacking; delete x.blocking; (g.players[pid].phased ??= []).push(x); }
  log(g, `${nm(c)} phases out.`); layer(g);
}
/** Suspend: at the beginning of your upkeep remove a time counter from each suspended card you own; when the last is removed you may cast it free. */
function suspendTick(g: Game) {
  const p = g.players[g.active];
  for (const c of p.exile) if (c.suspended) { const n = Math.max(0, (c.counters?.time ?? 0) - 1); (c.counters ??= {}).time = n; log(g, `A time counter is removed from ${nm(c)} (${n} left).`);
    if (n === 0) (g.delayed ??= []).push({ at: 'upkeep', pid: g.active, turnAfter: g.turn - 1, controller: g.active, sourceId: c.id, sourceUid: c.uid, label: `Suspend — you may cast ${nm(c)} without paying its mana cost.`, effects: [{ op: 'script', kind: 'suspendCast' } as Effect] }); }
}
export function suspendCard(g: Game, c: Card, n: number) { c.suspended = true; c.counters = { time: n }; log(g, `${nm(c)} is suspended with ${n} time counters.`); }
/** 'becomes the target of a spell or ability': fired once per targeted permanent when a spell/ability is put on the stack. */
function emitTargeted(g: Game, item: StackItem) {
  const seen = new Set<number>(); for (const t of item.targets ?? (item.target ? [item.target] : [])) { if (t?.card === undefined || seen.has(t.card)) continue; seen.add(t.card); const c = findCard(g, t.card); if (c) emit(g, 'targeted', { player: item.controller }, c); }
}
/** Captain America, Living Legend: during your turn, the first time each creature you control becomes tapped, untap it. */
function capUntap(g: Game) {
  const p = g.players[g.active]; if (!p.battlefield.some(c => def(c).name === 'Captain America, Living Legend')) return;
  for (const c of p.battlefield) if (c.tapped && isType(c, 'Creature') && c.capT !== g.turn && c.preTapT !== g.turn) { c.capT = g.turn; c.tapped = false; log(g, `Captain America: ${nm(c)} untaps.`); }
}
/** a token copy of t (optionally non-legendary, with extra subtypes) that enters tapped and attacking like atk */
function tokenCopyAtk(g: Game, ctx: ResCtx, pid: number, t: Card, atk: Card | undefined, o: { addSub?: string; end: 'exile' | 'sac' }): Card {
  const base = CARDS[t.origId ?? t.id] ?? def(t); const d: CardDef = { ...base, id: `${base.id}#tk${g.nextUid}`, legendary: false, sub: o.addSub ? [...(base.sub ?? []), o.addSub] : base.sub };
  CARDS[d.id] = d; const c = createToken(g, pid, d.id, { tapped: true, attackingLike: atk });
  addDelayed(g, ctx, { at: 'endStep', label: `${o.end === 'exile' ? 'exile' : 'sacrifice'} ${nm(c)}`, effects: [{ op: o.end === 'exile' ? 'exile' : 'sacUid', who: `uid:${c.uid}` } as Effect] }); return c;
}
function fireDelayed(g: Game, at: 'endStep' | 'upkeep') {
  const due = (g.delayed ?? []).filter(d => d.at === at && g.turn > d.turnAfter && (d.pid === undefined || d.pid === g.active));
  if (!due.length) return; g.delayed = g.delayed!.filter(d => !due.includes(d));
  for (const d of due) g.pending.push({ controller: d.controller, sourceId: d.sourceId, sourceUid: d.sourceUid, trig: { on: 'x', label: d.label, effects: d.effects }, event: { player: g.active } });
}
/** 'You may cast that card' mid-resolution. Humans get a 'cast' decision (the UI runs the normal cast flow); AI casts directly. */
function castNowStep(g: Game, ctx: ResCtx, key: string, pid: number, c: Card, free: boolean): boolean {
  if (key in ctx.ans) return !!ctx.ans[key];
  g.castNow = { pid, uid: c.uid, free };
  if (!canCast(g, pid, c) && !(def(c).cost.x && canCast(g, pid, c, { x: 0 }))) { delete g.castNow; ctx.ans[key] = false; return false; }
  if (!g.players[pid].human) { const r = !!AI.castNow?.(g, pid, c); delete g.castNow; ctx.ans[key] = r; return r; }
  g.decision = { key, pid, kind: 'cast', uid: c.uid, free, text: `You may cast ${nm(c)}${free ? ' without paying its mana cost' : ''} now.`, src: ctx.item.sourceId }; throw WAIT;
}
function searchBasicAuto(g: Game, pid: number, toHand = false) {
  const p = g.players[pid]; const l = p.library.find(c => def(c).basic && def(c).mana?.[0]?.add.some(s => p.identity.includes(s as Color)));
  if (!l) return; p.library = p.library.filter(x => x !== l);
  if (toHand) p.hand.push(l); else enter(g, l, pid, { tapped: true });
  shuffle(g, p.library); log(g, `${p.name} puts ${nm(l)} ${toHand ? 'into their hand' : 'onto the battlefield tapped'}.`);
}

// ---------------- state-based actions ----------------
/** "You win the game": every opponent loses. */
function winGame(g: Game, pid: number) { log(g, `${g.players[pid].name} wins the game!`); for (const q of g.players) if (q.id !== pid && !q.lost) lose(g, q, `${g.players[pid].name} won`); }
function lose(g: Game, p: Player, why: string) {
  p.lost = true; log(g, `${p.name} loses (${why}).`);
  if (g.monarch === p.id) { const nx = g.active === p.id ? nextAlive(g, p.id) : g.active; g.monarch = undefined; if (nx !== p.id && !g.players[nx].lost) becomeMonarch(g, nx); }
  p.exile.push(...p.battlefield.filter(c => !c.token)); p.battlefield = [];
  g.stack = g.stack.filter(s => s.controller !== p.id); g.pending = g.pending.filter(x => x.controller !== p.id);
  if (g.choice?.controller === p.id) g.choice = null;
  if (g.decision?.pid === p.id) { g.decision = null; g.res = null; }
  for (const c of attackers(g)) if (c.attacking === p.id) delete c.attacking;
  if (g.priority === p.id) g.priority = nextAlive(g, p.id);
  g.blockersDone = g.blockersDone.filter(x => x !== p.id);
  const a = alive(g); if (a.length === 1) { g.winner = a[0].id; g.priority = null; log(g, `${a[0].name} wins the game!`); }
}
export function checkState(g: Game) {
  for (let loop = 0; loop < 12; loop++) {
    layer(g);
    let changed = false;
    for (const p of g.players) for (const c of [...p.battlefield]) {
      if (!p.battlefield.includes(c)) continue;
      const cs = c.counters;
      { const sg = def(c).saga; if (sg && (cs?.lore ?? 0) >= sg && !g.stack.some(it => it.sourceUid === c.uid && it.chapter) && !g.pending.some(x => x.sourceUid === c.uid && x.trig.ev === 'chapter')) { log(g, `${nm(c)} is sacrificed (final chapter).`); destroy(g, c, 'sacrifice'); changed = true; continue; } }
      if (cs && cs['+1/+1'] && cs['-1/-1']) { const m = Math.min(cs['+1/+1'], cs['-1/-1']); cs['+1/+1'] -= m; cs['-1/-1'] -= m; }
      if (isType(c, 'Creature')) {
        if (toughness(g, c) <= 0) { if (c.unearthed) { moveCard(g, c, 'graveyard', { quiet: true }); changed = true; continue; } moveCard(g, c, 'graveyard', { quiet: true }); log(g, `${nm(c)} dies (0 toughness).`); g.died++; emit(g, 'dies', { player: c.owner }, c); changed = true; continue; }
        if ((c.damage >= toughness(g, c) || c.deathtouched) && !hasKw(c, 'indestructible')) { const before = p.battlefield.includes(c); destroy(g, c); if (before && !p.battlefield.includes(c)) changed = true; else { c.deathtouched = false; } continue; }
      }
      if (isType(c, 'Planeswalker') && !isType(c, 'Creature') && ctr(c, 'loyalty') <= 0) { moveCard(g, c, 'graveyard', { quiet: true }); log(g, `${nm(c)} has no loyalty left.`); emit(g, 'dies', { player: c.owner }, c); changed = true; continue; }
      if (c.attachedTo !== undefined) {
        const h = findCard(g, c.attachedTo);
        if (subtypes(def(c)).includes('Aura') && (!h || (def(c).aura && !validSlot(g, ctl(c), { ...def(c).aura!, f: { ...def(c).aura!.f, ctrl: undefined } }, { card: h.uid })))) { moveCard(g, c, 'graveyard', { quiet: true }); log(g, `${nm(c)} falls off (nothing to enchant).`); changed = true; continue; }
        if (!h || (!subtypes(def(c)).includes('Aura') && !isType(h, 'Creature'))) delete c.attachedTo;
      } else if (subtypes(def(c)).includes('Aura') && def(c).aura) { moveCard(g, c, 'graveyard', { quiet: true }); changed = true; continue; }
    }
    // legend rule (keep the newest)
    for (const p of g.players) {
      const seen = new Map<string, Card>();
      const noLR = p.battlefield.some(s => def(s).statics?.some(st => st.k === 'noLegendRule'));
      for (const c of [...p.battlefield].reverse()) { if (!def(c).legendary || (noLR && isType(c, 'Creature'))) continue; if (seen.has(def(c).name)) { moveCard(g, c, 'graveyard', { quiet: true }); log(g, `${nm(c)}: legend rule.`); changed = true; } else seen.set(def(c).name, c); }
    }
    if (!changed) break;
  }
  layer(g);
  for (const p of g.players) {
    if (p.lost || g.winner !== null) continue;
    const cd = Object.entries(p.cmdDamage).find(([, v]) => v >= 21);
    if (p.life <= 0) lose(g, p, 'life 0'); else if ((p.poison ?? 0) >= 10) lose(g, p, '10 poison counters'); else if (cd) lose(g, p, `21 commander damage from ${g.players[parseInt(cd[0])].name}`); else if (p.drewEmpty) lose(g, p, 'drew from empty library');
  }
}

// ---------------- combat ----------------
export const canAttack = (g: Game, c: Card, ignoreStep = false) => (ignoreStep || (g.step === 'attackers' && g.awaiting === 'attack')) && c.owner === g.active && isType(c, 'Creature') && !hasKw(c, 'defender') && !hasKw(c, '_cantattack') && !c.tapped && (!c.sick || hasKw(c, 'haste')) && c.attacking === undefined;
const mustAttack = (c: Card) => !!def(c).mustAttack || hasKw(c, '_mustattack') || !!c.goad || !!(c.mustAtk && c.mustAtk.t >= _G!.turn) || (!!def(c).statics?.some(s => s.k === 'atkMostLife') && !_G!.players[ctl(c)].battlefield.some(x => def(x).name === 'Silver Surfer, Galactus\'s Herald'));
let _G: Game | null = null;
/** The player this creature is required to attack, if any (Silver Surfer, Galactus). */
function mustVs(g: Game, c: Card): number | undefined {
  if (c.mustAtk && c.mustAtk.t >= g.turn && !g.players[c.mustAtk.pid].lost) return c.mustAtk.pid;
  if (def(c).statics?.some(s => s.k === 'atkMostLife') && !g.players[ctl(c)].battlefield.some(x => def(x).name === "Silver Surfer, Galactus's Herald")) { const os = opponents(g, ctl(c)); const m = Math.max(...os.map(o => o.life)); return os.find(o => o.life === m && !atkBlocked(g, c, o.id))?.id; }
  return undefined;
}
/** Attack restrictions against a player (vow counters, Queen Mother Ramonda, Willie Lumpkin). */
export function atkBlocked(g: Game, c: Card, def0: number): string | null {
  if (ctr(c, 'vow') > 0 && c.vowVs === def0) return 'vow counter';
  if (g.monarch === def0 && power(g, c) <= 2 && g.players[def0].battlefield.some(x => def(x).statics?.some(s => s.k === 'ramonda'))) return 'Queen Mother Ramonda';
  if (g.players[ctl(c)].noAtkVs?.some(r => r.pid === def0 && g.turn <= r.t)) return 'Willie Lumpkin';
  return null;
}
/** Planeswalker attack restrictions: "can't be attacked" (The Aetherspark) and "no more than one creature can attack ~ each combat" (The Eternal Wanderer). */
export function canBeAttackedPw(g: Game, w: Card): boolean {
  for (const st of def(w).statics ?? []) {
    if (st.k === 'cantBeAttacked' && (!st.cond || condOk(g, ctl(w), st.cond, w))) return false;
    if (st.k === 'atkLimit1' && attackers(g).some(a => a.atkPw === w.uid)) return false;
  }
  return true;
}
export function declareAttackers(g: Game, pid: number, list: { uid: number; defender: number; pw?: number }[]) {
  if (g.active !== pid || g.awaiting !== 'attack') return false;
  const p = g.players[pid]; const opp = opponents(g, pid);
  _G = g; for (const c of p.battlefield) if (mustAttack(c) && canAttack(g, c) && !list.some(l => l.uid === c.uid) && opp.length) {
    const ok = opp.filter(o => (!c.goad || o.id !== c.goad.by) && !atkBlocked(g, c, o.id)); const mv = mustVs(g, c); if (!ok.length && opp.every(o => atkBlocked(g, c, o.id))) continue; list = [...list, { uid: c.uid, defender: mv ?? (ok.length ? ok : opp).sort((a, b) => a.life - b.life)[0].id }];
  }
  for (const { uid, defender, pw } of list) {
    const c = p.battlefield.find(x => x.uid === uid); let d = g.players[defender];
    if (!c || !canAttack(g, c) || !d || d.lost || defender === pid) continue;
    if (c.goad && defender === c.goad.by) { const alt = opp.find(o => o.id !== c.goad!.by); if (alt) d = alt; }
    { const mv = mustVs(g, c); if (mv !== undefined && mv !== d.id) d = g.players[mv]; }
    { const why = atkBlocked(g, c, d.id); if (why) { log(g, `${nm(c)} can't attack ${d.name} (${why}).`); continue; } }
    { const k = d.battlefield.filter(x => def(x).statics?.some(s => s.k === 'propaganda')).length; if (k) { const cost = { generic: 2 * k }; if (!planPayment(p, cost) || !pay(g, p, cost)) { log(g, `${nm(c)} can't attack ${d.name}: can't pay {${2 * k}} (Propaganda).`); continue; } log(g, `${p.name} pays {${2 * k}} to attack ${d.name} with ${nm(c)}.`); } }
    let w = pw !== undefined ? d.battlefield.find(x => x.uid === pw && isType(x, 'Planeswalker')) : undefined;
    if (w && !canBeAttackedPw(g, w)) { log(g, `${nm(w)} can't be attacked (by more creatures) right now.`); w = undefined; }
    c.attacking = d.id; c.blockedBy = []; if (w) c.atkPw = w.uid; else delete c.atkPw; if (!hasKw(c, 'vigilance')) c.tapped = true;
    log(g, `${nm(c)} attacks ${w ? nm(w) + ` (${d.name})` : d.name}.`);
  }
  g.awaiting = null;
  const atk = attackers(g);
  for (const c of atk) emit(g, 'attacks', { player: c.attacking }, c);
  { const A = (p.atkDefs ??= { turn: g.turn, defs: [] }); for (const a of atk) if (a.attacking !== undefined && !A.defs.includes(a.attacking)) A.defs.push(a.attacking); }
  if (atk.length) emit(g, 'youAttack', { player: pid, amount: atk.length });
  for (const defId of [...new Set(atk.map(a => a.attacking).filter((x): x is number => x !== undefined))]) emit(g, 'attackPlayer', { player: pid, vs: defId, amount: atk.filter(a => a.attacking === defId).length });
  if (atk.length === 1) { const n = p.battlefield.filter(c => hasKw(c, 'exalted')).length; if (n) { atk[0].pp += n; atk[0].pt += n; log(g, `Exalted: ${nm(atk[0])} gets +${n}/+${n}.`); } }
  givePriority(g); return true;
}
const protBlocks = (b: Card, a: Card) => def(b).colors.some(k => hasKw(a, `protection from ${COLOR_WORD[k]}`));
export const canBlock = (g: Game, b: Card, a: Card) => blockReason(g, b, a) === null;
/** Why b can't block a (null if it can). Used by the UI to explain invalid drops. */
export function blockReason(g: Game, b: Card, a: Card): string | null {
  if (!isType(b, 'Creature')) return 'Only creatures can block';
  if (b.tapped) return 'Tapped creatures can\'t block';
  if (b.blocking !== undefined) return 'Already blocking';
  if (a.attacking !== b.owner) return 'Not attacking you';
  if (hasKw(b, '_cantblock')) return 'This creature can\'t block';
  if (hasKw(a, '_hasteonly') && !hasKw(b, 'haste')) return 'Can only be blocked by creatures with haste';
  if (hasKw(a, '_noblockgtpow') && power(g, b) > power(g, a)) return 'Can\'t be blocked by creatures with greater power';
  if (hasKw(a, '_unblockable')) return 'Can\'t be blocked';
  if (protBlocks(b, a)) return 'Protection: can\'t be blocked by that color';
  if (hasKw(a, 'flying') && !hasKw(b, 'flying') && !hasKw(b, 'reach')) return 'Flying: needs a blocker with flying or reach';
  if (hasKw(a, 'shadow') !== hasKw(b, 'shadow')) return hasKw(a, 'shadow') ? 'Shadow: only creatures with shadow can block it' : 'Creatures with shadow can only block shadow';
  if (hasKw(a, 'horsemanship') && !hasKw(b, 'horsemanship')) return 'Horsemanship: needs a blocker with horsemanship';
  if (hasKw(a, 'fear') && !isType(b, 'Artifact') && !def(b).colors.includes('B')) return 'Fear: only artifact or black creatures can block it';
  if (hasKw(a, 'intimidate') && !isType(b, 'Artifact') && !def(b).colors.some(k => def(a).colors.includes(k))) return 'Intimidate: only artifact creatures or creatures sharing a color can block it';
  for (const [w, t] of [['plainswalk', 'Plains'], ['islandwalk', 'Island'], ['swampwalk', 'Swamp'], ['mountainwalk', 'Mountain'], ['forestwalk', 'Forest']] as const) if (hasKw(a, w) && g.players[b.owner].battlefield.some(x => isTypeOrSub(def(x), t))) return `${t[0] + t.slice(1).toLowerCase()}walk: you control a ${t}`;
  for (const p of g.players) for (const src of p.battlefield) for (const st of def(src).statics ?? []) if (st.k === 'cantBeBlockedBy' && staticApplies(g, st, src, a) && matches(g, b, st.spellF, ctl(src))) return "Can't be blocked by creatures like this";
  return null;
}
/** Attackers in a planned block (blocker uid -> attacker uid) that have menace but exactly one blocker; those blocks would be dropped. */
export function menaceShort(g: Game, plan: Record<number, number>): number[] {
  const n: Record<number, number> = {}; for (const a of Object.values(plan)) n[a] = (n[a] ?? 0) + 1;
  return Object.entries(n).filter(([a, k]) => k === 1 && hasKw(findCard(g, +a)!, 'menace')).map(([a]) => +a);
}
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
  for (const a of attackers(g)) if (a.attacking === defender) { for (const u of a.blockedBy!) { const b = findCard(g, u)!; log(g, `${nm(b)} blocks ${nm(a)}.`); emit(g, 'blocks', { player: defender }, b); } if (a.blockedBy!.length) emit(g, 'blocked', { player: g.active }, a); }
  g.blockersDone.push(defender); maybeFinishBlocks(g); return true;
}
function maybeFinishBlocks(g: Game) { if (g.awaiting === 'block' && defenders(g).every(d => g.blockersDone.includes(d))) { g.awaiting = null; jewelCheck(g); givePriority(g); } }
/** Coveted Jewel: unblocked attackers at its controller → the attacker draws three and gains control of it. */
function jewelCheck(g: Game) { for (const q of g.players) if (q.id !== g.active) for (const j of q.battlefield) if (def(j).jewel && attackers(g).some(a => a.attacking === q.id && !a.blockedBy?.length)) g.pending.push({ controller: q.id, sourceId: j.id, sourceUid: j.uid, trig: { on: 'x', label: 'the attacking player draws three cards and gains control of it', effects: [{ op: 'script', kind: 'jewel' } as Effect] }, event: { player: g.active } }); }
interface Dmg { src: Card; toCard?: Card; toPlayer?: number; amt: number; pw?: boolean }
/** Unblocked/trample damage goes to the attacked planeswalker (if it's still there) or the defending player. */
function hitDef(g: Game, a: Card, amt: number): Dmg {
  if (a.atkPw !== undefined) { const w = findCard(g, a.atkPw); return w && w.owner === a.attacking && isType(w, 'Planeswalker') ? { src: a, toCard: w, amt, pw: true } : { src: a, amt: 0 }; }
  return { src: a, toPlayer: a.attacking, amt };
}
function dealCombat(g: Game, first: boolean, hadFirst = false) {
  const strikes = (c: Card) => first ? strikesFirst(c) : (!hadFirst || !hasKw(c, 'first strike') || hasKw(c, 'double strike'));
  const ev: Dmg[] = [];
  for (const a of attackers(g)) {
    if (!strikes(a)) continue; const pw = power(g, a); if (pw <= 0) continue;
    if (!a.blockedBy?.length) { ev.push(hitDef(g, a, pw)); continue; }
    const bl = a.blockedBy.map(u => findCard(g, u)).filter((x): x is Card => !!x && x.blocking === a.uid); let rem = pw;
    bl.forEach((b, i) => {
      const lethal = hasKw(a, 'deathtouch') ? 1 : Math.max(0, toughness(g, b) - b.damage);
      const amt = i === bl.length - 1 && !hasKw(a, 'trample') ? rem : Math.min(rem, lethal);
      if (amt > 0) ev.push({ src: a, toCard: b, amt }); rem -= amt;
    });
    if (rem > 0 && hasKw(a, 'trample')) ev.push(hitDef(g, a, rem));
  }
  for (const p of g.players) for (const b of p.battlefield) {
    if (b.blocking === undefined || !strikes(b)) continue; const a = findCard(g, b.blocking); const pw = power(g, b);
    if (a && pw > 0) ev.push({ src: b, toCard: a, amt: pw });
  }
  const hits: { src: Card; player: number; amt: number }[] = []; const dealt = new Map<Card, number>();
  for (const e of ev) {
    if (e.toCard) { const n = dealDamage(g, e.src.id, e.src, { card: e.toCard }, e.amt, true); dealt.set(e.src, (dealt.get(e.src) ?? 0) + (n || 0)); if (n && e.pw) log(g, `${nm(e.src)} deals ${n} combat damage to ${nm(e.toCard)}.`); }
    else if (e.toPlayer !== undefined) {
      const n = dealDamage(g, e.src.id, e.src, { player: e.toPlayer }, e.amt, true); dealt.set(e.src, (dealt.get(e.src) ?? 0) + (n || 0));
      if (n) { log(g, `${nm(e.src)} deals ${e.amt} combat damage to ${g.players[e.toPlayer].name}.`); hits.push({ src: e.src, player: e.toPlayer, amt: e.amt }); }
    }
  }
  for (const h of hits) emit(g, 'combatDamagePlayer', { player: h.player, amount: h.amt }, h.src);
  for (const h of hits) if (g.monarch === h.player && ctl(h.src) !== h.player) monarchTrig(g, ctl(h.src), 'becomes the monarch (combat damage to the monarch)', [{ op: 'monarch', pl: 'you' }]);
  // 'Whenever one or more creatures you control deal combat damage to a player': once per damaged player
  for (const k of new Set(hits.map(h => `${ctl(h.src)}:${h.player}`))) emit(g, 'combatBatch', { player: +k.split(':')[0] });
  for (const [src, n] of dealt) if (n > 0) emit(g, 'combatDamage', { player: ctl(src), amount: n }, src);
  checkState(g);
}
