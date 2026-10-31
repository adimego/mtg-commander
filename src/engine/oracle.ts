/** Oracle-text ability compiler: turns Scryfall rules text into the engine's data-driven abilities.
 *  Every rules line either compiles into an exact engine representation or is reported as unparsed;
 *  callers use that to badge cards honestly ("Supported" vs "Limited"). */
import SUBTYPES from './subtypes.json';
import type { ActAbility, Amt, CardDef, CEFx, Color, Cond, Cost, Effect, Filter, ManaAbility, ManaSym, Modes, PRef, Ref, Static, TokenSpec, TriggerDef, TSlot } from './types';

const SUB = new Map<string, string>((SUBTYPES as string[]).map(s => [s.toLowerCase(), s]));
const TYPES: Record<string, string> = { creature: 'Creature', artifact: 'Artifact', enchantment: 'Enchantment', land: 'Land', planeswalker: 'Planeswalker', instant: 'Instant', sorcery: 'Sorcery', battle: 'Battle', permanent: 'Permanent', legendary: 'Legendary', historic: 'Historic', outlaw: 'Outlaw' };
const COLOR_OF: Record<string, Color> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
export const KWS = ['compleated', 'flying', 'trample', 'haste', 'vigilance', 'lifelink', 'deathtouch', 'first strike', 'double strike', 'reach', 'menace', 'defender', 'flash', 'hexproof', 'prowess', 'indestructible', 'shroud', 'protection from white', 'protection from blue', 'protection from black', 'protection from red', 'protection from green', 'changeling', 'devoid', 'fear', 'intimidate', 'shadow', 'horsemanship', 'plainswalk', 'islandwalk', 'swampwalk', 'mountainwalk', 'forestwalk', 'exalted'];
const IRREG: Record<string, string> = { elves: 'elf', dwarves: 'dwarf', wolves: 'wolf', werewolves: 'werewolf', fungi: 'fungus', mice: 'mouse', sorceries: 'sorcery', allies: 'ally', faeries: 'faerie', zombies: 'zombie', zombie: 'zombie', thieves: 'thief', leeches: 'leech', octopi: 'octopus', 'cyclopes': 'cyclops', 'sphinxes': 'sphinx', 'foxes': 'fox', 'boars': 'boar', 'mercenaries': 'mercenary', 'slivers': 'sliver' };
function typeWord(w: string): string | null {
  const cands = [IRREG[w], w, w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, '')].filter(Boolean) as string[];
  for (const c of cands) { if (TYPES[c]) return TYPES[c]; if (SUB.has(c)) return SUB.get(c)!; }
  return null;
}
const NUMW: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, another: 1 };
const N = '(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|x|\\d+)';
function num(s: string | undefined): number | 'X' | null { if (!s) return null; if (s === 'x') return 'X'; if (/^\d+$/.test(s)) return +s; return NUMW[s] ?? null; }

// ---------- costs ----------
export function parseCost(mc = ''): Cost | null {
  const cost: Cost = { generic: 0 };
  for (const [, s0] of mc.matchAll(/\{([^}]+)\}/g)) {
    const s = s0.toUpperCase();
    if (/^\d+$/.test(s)) cost.generic += +s;
    else if (s === 'C') cost.C = (cost.C ?? 0) + 1;
    else if ('WUBRG'.includes(s) && s.length === 1) cost[s as Color] = (cost[s as Color] ?? 0) + 1;
    else if (s === 'X') cost.x = (cost.x ?? 0) + 1;
    else if (/^[WUBRG]\/P$/.test(s)) (cost.phy ??= []).push(s[0] as Color);
    else if (/^([WUBRG2])\/([WUBRG])$/.test(s)) (cost.hyb ??= []).push(s.replace('/', '|'));
    else return null;
  }
  if (mc.replace(/\{[^}]+\}/g, '').trim()) return null;
  return cost;
}

// ---------- filters ----------
export interface FP { f: Filter; card?: boolean; spell?: boolean; plural?: boolean }
const KW_RE = '(flying|trample|haste|vigilance|lifelink|deathtouch|first strike|double strike|reach|menace|defender|flash|hexproof|indestructible)';
export function parseFilter(s0: string): FP | null {
  let s = ` ${s0.trim()} `; const f: Filter = {}; let plural = false;
  s = s.replace(/ commander (?=creatures? |permanents? )/, () => { f.cmdr = 'any'; return ' '; }).replace(/ you own $/, () => { f.cmdr = f.cmdr ? 'own' : f.cmdr; return f.cmdr === 'own' ? ' ' : ' you own '; });
  s = s.replace(/ (?:that aren't|that isn't|not) of the chosen type(?= )/, () => { f.notChosenType = true; return ''; }).replace(/ of the chosen type(?= )/, () => { f.chosenType = true; return ''; });
  const SUF: [RegExp, (m: RegExpExecArray) => void][] = [
    [/ you control $/, () => (f.ctrl = 'you')],
    [/ (?:an opponent controls|your opponents control|you don't control|target opponent controls|opponents control) $/, () => (f.ctrl = 'opp')],
    [/ with toughness (\d+) or greater $/, m => (f.touGE = +m[1])], [/ with toughness (\d+) or less $/, m => (f.touLE = +m[1])],
    [/ with power (\d+) or less $/, m => (f.powLE = +m[1])], [/ with power (\d+) or greater $/, m => (f.powGE = +m[1])],
    [/ with (?:mana value|converted mana cost) (\d+) or less $/, m => (f.mvLE = +m[1])], [/ with (?:mana value|converted mana cost) (\d+) or greater $/, m => (f.mvGE = +m[1])],
    [new RegExp(` with ${KW_RE} $`), m => (f.kw = m[1])], [new RegExp(` without ${KW_RE} $`), m => (f.noKw = m[1])],
    [/ that's attacking $| that's attacking you $/, () => (f.attacking = true)], [/ that's blocking $/, () => (f.blocking = true)],
    [/ on the battlefield $/, () => {}],
    [/ that's one or more colors $/, () => (f.colored = true)],
    [/ with an? ([+-]\d\/[+-]\d|[a-z]+) counter on (?:it|them) $/, m => (f.ctr = m[1])],
    [/ with (?:mana value|converted mana cost) x or less $/, () => (f.mvLEX = true)], [/ with (?:mana value|converted mana cost) x $/, () => (f.mvEqX = true)],
  ];
  for (let changed = true; changed;) { changed = false; for (const [re, fn] of SUF) { const m = re.exec(s); if (m) { fn(m); s = s.slice(0, m.index) + ' '; changed = true; } } }
  let w = s.trim().replace(/attacking or blocking/, 'atkblk').split(/\s+/).filter(Boolean);
  const notT: string[] = []; const cols: Color[] = []; const notC: Color[] = [];
  while (w.length > 1 || (w.length === 1 && /^(other|another)$/.test(w[0]))) {
    const x = w[0];
    if (x === 'other' || x === 'another') f.other = true;
    else if (x === 'tapped') f.tapped = true; else if (x === 'untapped') f.untapped = true;
    else if (x === 'attacking') f.attacking = true; else if (x === 'blocking') f.blocking = true; else if (x === 'atkblk') f.atkOrBlk = true;
    else if (x === 'legendary' && w.length > 1) f.legendary = true; else if (x === 'nonlegendary') f.nonlegendary = true;
    else if (x === 'basic') f.basic = true; else if (x === 'nonbasic') f.nonbasic = true;
    else if (x === 'nontoken') f.nontoken = true; else if (x === 'colorless') f.colorless = true; else if (x === 'multicolored') f.multicolor = true;
    else if (COLOR_OF[x]) cols.push(COLOR_OF[x]);
    else if (x === 'or' && cols.length && COLOR_OF[w[1]]) { /* "white or black creature" */ }
    else if (/^non-?/.test(x) && COLOR_OF[x.replace(/^non-?/, '')]) notC.push(COLOR_OF[x.replace(/^non-?/, '')]);
    else if (/^non-?/.test(x) && typeWord(x.replace(/^non-?/, ''))) notT.push(typeWord(x.replace(/^non-?/, ''))!);
    else break;
    w = w.slice(1);
  }
  let core = w.join(' ');
  let card = false, spell = false;
  if (/(^| )tokens?$/.test(core)) { f.token = true; core = core.replace(/ ?tokens?$/, ''); if (/s$/.test(w[w.length - 1])) plural = true; }
  if (/(^| )cards?$/.test(core)) { card = true; if (/cards$/.test(core)) plural = true; core = core.replace(/ ?cards?$/, ''); }
  if (/(^| )spells?$/.test(core)) { spell = true; if (/spells$/.test(core)) plural = true; core = core.replace(/ ?spells?$/, ''); }
  if (core === 'permanents' || core === 'permanent') { if (core.endsWith('s')) plural = true; core = ''; f.types = ['Permanent']; }
  if (core && / and /.test(core)) { const ps = core.split(/,? and |, /); if (ps.length > 1 && ps.every(p => /^[a-z]+s$/.test(p) && typeWord(p))) core = ps.join(', '); }
  if (core) {
    const parts = core.split(/,? or |, (?:and\/or )?/).map(x => x.trim()).filter(Boolean);
    if (parts.length > 1) { const ts = parts.map(p => p.split(' ').map(typeWord)); if (ts.some(t => t.some(x => !x))) return null; if (ts.every(t => t.length === 1)) f.anyType = ts.map(t => t[0]!); else return null; if (parts.some(p => /s$/.test(p) && typeWord(p) !== p)) plural = true; }
    else { const ws = core.split(' '); const ts = ws.map(typeWord); if (ts.some(t => !t)) return null; f.types = [...(f.types ?? []), ...(ts as string[])]; if (/s$/.test(ws[ws.length - 1]) && !SUB.has(ws[ws.length - 1]) && !TYPES[ws[ws.length - 1]]) plural = true; }
  } else if (!card && !spell && !f.types && !f.token) return null;
  if (notT.length) f.notTypes = notT; if (cols.length) f.colors = cols; if (notC.length) f.notColors = notC;
  return { f, card, spell, plural };
}

// ---------- context ----------
interface Cx { slots: TSlot[]; it?: Ref; that?: Ref; thatPl?: PRef; spell?: boolean; lastPl?: PRef }
const newCx = (o: Partial<Cx> = {}): Cx => ({ slots: [], it: 'self', ...o });
function addSlot(cx: Cx, s: TSlot): string { cx.slots.push(s); return 't' + (cx.slots.length - 1); }

function playerRef(s: string, cx: Cx, harm = true): PRef | null {
  s = s.trim();
  if (s === 'you' || s === 'your') return 'you';
  if (/^(each opponent|each of your opponents|your opponents|opponents|all opponents)$/.test(s)) return 'opps';
  if (/^(each player|all players|every player)$/.test(s)) return 'all';
  if (s === 'target player' || s === "target player's") return addSlot(cx, { who: 'player', harm });
  if (s === 'target opponent' || s === "target opponent's") return addSlot(cx, { who: 'opp', harm: true });
  if (/^that player'?s?$/.test(s) || s === 'they' || s === 'their') return cx.thatPl ?? cx.lastPl ?? 'evp';
  if (/^(its|that creature's|that permanent's|that spell's|that card's|their) controllers?$/.test(s)) return 'ctl:' + (cx.it ?? 'self');
  if (/^(its|that creature's|that permanent's|that card's|their) owners?$/.test(s)) return 'owner:' + (cx.it ?? 'self');
  if (s === 'defending player') return 'def';
  if (s === 'the active player') return 'active';
  return null;
}
interface ObjR { ref: Ref; pl?: PRef; card?: boolean }
function obj(s: string, cx: Cx, harm: boolean): ObjR | null {
  s = s.trim().replace(/^the /, '');
  if (s === '~' || s === 'itself') return { ref: 'self' };
  if (/^(it|they|them)$/.test(s)) return { ref: cx.it ?? 'self' };
  if (/^(that creature|that permanent|that card|that token|that land|that artifact|those creatures|those cards|those tokens|that enchantment|that spell|that planeswalker)$/.test(s)) return { ref: cx.that ?? cx.it ?? 'ev' };
  if (/^that [a-z]+$/.test(s) && typeWord(s.slice(5)) && SUB.has(s.slice(5))) return { ref: cx.that ?? cx.it ?? 'ev' };
  if (/^(enchanted|equipped) (creature|permanent|land|artifact|planeswalker)$/.test(s)) return { ref: 'attached' };
  if (s === 'any target' || s === 'any other target') return { ref: addSlot(cx, { who: 'any', harm }) };
  if (/^(one|two|three|\d+) target/.test(s) && !/^(one|two|three|\d+) target (creature|player|[a-z]+s\b)/.test(s)) return null;
  const tm = /^(?:(up to )?(one|two|three|four|five|x|\d+) )?(other |another )?target (.+)$/.exec(s);
  if (tm) {
    const n = tm[2] ? num(tm[2]) : 1; if (n === null || n === 'X') return null; const opt = !!tm[1]; let noun = tm[4];
    if (/^(creature or player|player or planeswalker|creature, player, or planeswalker|creature or planeswalker or player)$/.test(noun)) { const i = cx.slots.length; for (let k = 0; k < n; k++) addSlot(cx, { who: 'any', harm, opt, ...(n > 1 ? { grp: i } : {}) }); return { ref: n === 1 ? 't' + i : `tr:${i}-${i + n - 1}` }; }
    if (/^(player|players)$/.test(noun)) return { ref: addSlot(cx, { who: 'player', harm, opt }), pl: 't' + (cx.slots.length - 1) };
    if (/^(opponent|opponents)$/.test(noun)) return { ref: addSlot(cx, { who: 'opp', harm: true, opt }), pl: 't' + (cx.slots.length - 1) };
    if (/^(activated or triggered ability|activated ability|triggered ability)$/.test(noun)) return { ref: addSlot(cx, { who: 'ability', harm: true }) };
    let who: TSlot['who'] = 'perm'; let zoneOwner: TSlot['zoneOwner'];
    const gm = /^(.+?) (?:card|cards)( with [a-z0-9 ]+?)? (?:from|in) (your|a|an opponent's|target player's|that player's) graveyards?$/.exec(noun) ?? /^(card|cards)( with [a-z0-9 ]+?)? (?:from|in) (your|a|an opponent's) graveyards?$/.exec(noun);
    if (gm) { who = 'card'; zoneOwner = gm[3] === 'your' ? 'you' : gm[3] === 'a' ? 'any' : 'opp'; noun = (gm[1] === 'card' || gm[1] === 'cards' ? 'card' : gm[1] + ' card') + (gm[2] ?? ''); }
    const fp = parseFilter(noun); if (!fp) return null;
    if (fp.spell) who = 'spell'; else if (fp.card && who !== 'card') return null;
    if (tm[3]) fp.f.other = true;
    const i = cx.slots.length; for (let k = 0; k < n; k++) addSlot(cx, { who, f: fp.f, harm: who === 'card' ? false : harm, opt, zoneOwner, ...(n > 1 ? { grp: i } : {}), ...(tm[3] && i > 0 ? { distinct: true } : {}) });
    return { ref: n === 1 ? 't' + i : `tr:${i}-${i + n - 1}`, card: who === 'card' };
  }
  const am = /^(?:each|all) (.+)$/.exec(s);
  if (am) { const gy = /^(.+?) (?:cards )?(?:in|from) (?:all )?graveyards$/.exec(am[1]); if (gy) { const fp = parseFilter(gy[1] + ' cards'); return fp ? { ref: { all: fp.f, zone: 'graveyard' } } : null; } const fp = parseFilter(am[1]); if (!fp || fp.card || fp.spell) return null; return { ref: { all: fp.f } }; }
  if (!/^(a|an|one) /.test(s)) { const fp = parseFilter(s); if (fp && fp.plural && !fp.card && !fp.spell) return { ref: { all: fp.f } }; }
  return null;
}

// ---------- amounts ----------
function amount(s: string, cx: Cx): Amt | null {
  { const dv = /^(?:x is )?your devotion to (white|blue|black|red|green)(?: and (white|blue|black|red|green))?$/.exec(s.trim()); if (dv) { const C: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }; return { devotion: [C[dv[1]], ...(dv[2] ? [C[dv[2]]] : [])] as Color[] }; } }
  s = s.trim();
  const n = num(s); if (n !== null) return n;
  if (s === 'that much' || s === 'that many') return 'ev';
  if (/^(?:equal to )?your speed$/.test(s)) return 'speed';
  if (/^(?:equal to )?the amount of mana spent to cast (?:that spell|it)$/.test(s)) return 'spent';
  const eq = /^(?:equal to )?(.+)$/.exec(s)![1];
  let m: RegExpExecArray | null;
  if ((m = /^(its|~'s|that creature's|the sacrificed creature's|target creature's|the exiled creature's|that card's|that permanent's|that spell's|the exiled card's) (power|toughness|mana value)$/.exec(eq))) {
    const r: Ref = m[1] === "~'s" ? 'self' : m[1] === 'its' ? cx.it ?? 'self' : m[1] === "the sacrificed creature's" ? 'ev' : m[1] === "target creature's" ? 't0' : cx.that ?? cx.it ?? 'ev';
    return m[2] === 'power' ? { pow: r } : m[2] === 'toughness' ? { tough: r } : { mv: r };
  }
  if ((m = /^the number of cards in (your|target player's|that player's|their) hand$/.exec(eq))) return { cards: 'hand', pl: playerRef(m[1], cx) ?? 'you' };
  if ((m = /^the number of (.+?) ?cards in your graveyard$/.exec(eq))) { const fp = m[1] ? parseFilter(m[1]) : { f: {} }; return fp ? { cards: 'graveyard', pl: 'you', f: fp.f } : null; }
  if ((m = /^the number of (?:\+1\/\+1 )?counters on ~$/.exec(eq))) return { ctr: '+1/+1', who: 'self' };
  if (/^the number of opponents you have$/.test(eq)) return { opps: true };
  if (/^your life total$/.test(eq)) return { life: 'you' };
  if ((m = /^the (?:greatest|highest) power among (.+)$/.exec(eq))) { const fp = parseFilter(m[1]); return fp && !fp.card ? { maxPow: fp.f } : null; }
  if (/^the life you've gained this turn$|^the amount of life you gained this turn$/.test(eq)) return { lifeGained: true };
  if ((m = /^the number of (.+?)$/.exec(eq))) { const fp = parseFilter(m[1]); return fp && !fp.card && !fp.spell ? { count: fp.f } : null; }
  return null;
}
/** "for each X" → amount */
function forEach(s: string, cx: Cx): Amt | null {
  let m: RegExpExecArray | null;
  if (/^opponent you have$|^opponent$/.test(s)) return { opps: true };
  if ((m = /^card in (your|target player's|that player's) hand$/.exec(s))) return { cards: 'hand', pl: playerRef(m[1], cx) ?? 'you' };
  if ((m = /^(.*?) ?card in (their|that player's|target player's|target opponent's) graveyard$/.exec(s))) { const fp = m[1] ? parseFilter(m[1]) : { f: {} }; const p = m[2] === 'their' || m[2] === "that player's" ? cx.lastPl ?? cx.thatPl : playerRef(m[2], cx); return fp && p ? { cards: 'graveyard', pl: p, f: fp.f } : null; }
  if ((m = /^(.*?) ?card in your graveyard$/.exec(s))) { const fp = m[1] ? parseFilter(m[1]) : { f: {} }; return fp ? { cards: 'graveyard', pl: 'you', f: fp.f } : null; }
  if ((m = /^(\+1\/\+1|[a-z]+) counter on ~$/.exec(s))) return { ctr: m[1], who: 'self' };
  const fp = parseFilter(s); if (fp && !fp.card && !fp.spell) return { count: fp.f };
  return null;
}
function withForEach(base: Amt, s: string | undefined, cx: Cx): Amt | null {
  if (!s) return base; const fe = forEach(s, cx); if (!fe) return null;
  return base === 1 ? fe : typeof base === 'number' ? { mul: base, of: fe } : null;
}

// ---------- conditions ----------
function cond(s: string, cx: Cx): Cond | null {
  s = s.trim(); let m: RegExpExecArray | null;
  if (/^it's your turn$/.test(s)) return { k: 'yourTurn' };
  if (/^you control a commander$/.test(s)) return { k: 'ctlCommander' };
  if (/^it's not your turn$/.test(s)) return { k: 'notYourTurn' };
  if (/^you've cast a noncreature spell this turn$/.test(s)) return { k: 'castNoncThisTurn' };
  if (/^an opponent has cast a spell this turn$/.test(s)) return { k: 'oppCastThisTurn' };
  if (/^you're the monarch$|^you are the monarch$/.test(s)) return { k: 'monarch' };
  if (/^there is no monarch$/.test(s)) return { k: 'noMonarch' };
  if ((m = /^you control (\w+) or fewer other lands$/.exec(s)) && typeof num(m[1]) === 'number') return { k: 'otherLandsLE', n: num(m[1]) as number };
  if (/^(this spell|~|it) was kicked$/.test(s)) return { k: 'kicked' };
  if ((m = /^you control (a|an|another|two|three|four|five|seven|\d+)(?: or more)? (.+)$/.exec(s))) { const fp = parseFilter(m[2].replace(/,? or (?:a|an) /g, ' or ')); if (!fp) return null; if (m[1] === 'another') fp.f.other = true; return { k: 'control', f: { ...fp.f, ctrl: undefined }, n: m[1] === 'another' ? 1 : num(m[1]) as number }; }
  if ((m = /^you control no (.+)$|^you don't control (?:a|an|any) (.+)$/.exec(s))) { const fp = parseFilter(m[1] ?? m[2]); return fp ? { k: 'controlNo', f: { ...fp.f, ctrl: undefined } } : null; }
  if ((m = /^you have (\d+) or more life$|^you have at least (\d+) life$/.exec(s))) return { k: 'lifeGE', n: +(m[1] ?? m[2]) };
  if ((m = /^you have (\d+) or less life$/.exec(s))) return { k: 'lifeLE', n: +m[1] };
  if (/^you have no cards in hand$/.test(s)) return { k: 'noCardsHand' };
  if ((m = /^you have (\w+) or fewer cards in hand$/.exec(s))) return { k: 'handLE', n: num(m[1]) as number };
  if ((m = /^you have (\w+) or more cards in hand$/.exec(s))) return { k: 'handGE', n: num(m[1]) as number };
  if ((m = /^there are (\w+) or more (.*?) ?cards in your graveyard$|^(\w+) or more (.*?) ?cards are in your graveyard$/.exec(s))) { const fp = (m[2] ?? m[4]) ? parseFilter((m[2] ?? m[4])) : { f: {} }; return fp ? { k: 'gyGE', n: num(m[1] ?? m[3]) as number, f: fp.f } : null; }
  if ((m = /^an opponent controls more (.+?) than you$/.exec(s))) { const fp = parseFilter(m[1]); return fp ? { k: 'oppControlsMore', f: { ...fp.f, ctrl: undefined } } : null; }
  if (/^~ entered this turn$/.test(s)) return { k: 'enteredThisTurn' };
  if (/^your library has no cards in it$/.test(s)) return { k: 'libEmpty' };
  if (/^(~|it) is attacking$|^(~|it)'s attacking$/.test(s)) return { k: 'attacking' };
  if (/^~ is tapped$/.test(s)) return { k: 'tapped' };
  if (/^~ is prepared$/.test(s)) return { k: 'prepared' };
  if (/^~ is saddled$/.test(s)) return { k: 'saddled' };
  if (s === '§incr') return { k: 'incr' };
  if (/^(?:~|this spell)'s sneak cost was paid$/.test(s)) return { k: 'sneakPaid' };
  if (/^(?:~|this spell|it) was cast using web-slinging$/.test(s)) return { k: 'webSlung' };
  { const mm = /^(\w+) or more mana was spent to cast (?:that spell|it|~)$/.exec(s); const nn = num(mm?.[1]); if (mm && typeof nn === 'number') return { k: 'spentGE', n: nn }; }
  if (/^a permanent left the battlefield under your control this turn$/.test(s)) return { k: 'leftYours' };
  if (/^you have an enduring story$/.test(s)) return { k: 'enduring' };
  if (/^(?:this spell|~|it) was cast using teamwork$/.test(s)) return { k: 'teamwork' };
  if (/^you discarded a nonland card$/.test(s)) return { k: 'chosenNonland' };
  { const mm = /^your opponents control (\w+) or more lands$/.exec(s); const nn = num(mm?.[1]); if (typeof nn === 'number') return { k: 'oppLandsGE', n: nn }; }
  if (/^you have max speed$/.test(s)) return { k: 'maxSpeed' };
  if (/^a nonland permanent left the battlefield this turn or a spell was warped this turn$/.test(s)) return { k: 'void' };
  if (/^~ isn't prepared$/.test(s)) return { k: 'not', c: { k: 'prepared' } };
  if (/^~ is untapped$/.test(s)) return { k: 'untapped' };
  if (/^you gained life this turn$|^you've gained life this turn$/.test(s)) return { k: 'lifeGainedThisTurn', n: 1 };
  if ((m = /^you(?:'ve)? gained (\d+) or more life this turn$/.exec(s))) return { k: 'lifeGainedThisTurn', n: +m[1] };
  if (/^a creature died this turn$/.test(s)) return { k: 'creatureDiedThisTurn' };
  if (/^you descended this turn$/.test(s)) return { k: 'descended' };
  if ((m = /^x is (\d+) or more$/.exec(s))) return { k: 'xGE', n: +m[1] };
  if ((m = /^an opponent has (\d+) or less life$/.exec(s))) return { k: 'oppLifeLE', n: +m[1] };
  if ((m = /^(?:it|that creature|that card|it was) (?:is|was|'s) (?:a|an) (.+)$|^it's (?:a|an) (.+)$/.exec(s))) { const fp = parseFilter(m[1] ?? m[2]); return fp ? { k: 'evIs', f: fp.f } : null; }
  if (/^(it|that creature) was a creature you control$|^you controlled it$/.test(s)) return { k: 'evCtlYou' };
  if ((m = /^(?:it|that permanent|that artifact)(?:'s not| isn't) an? ([a-z]+)$/.exec(s))) { const fp = parseFilter(m[1]); return fp ? { k: 'not', c: { k: 'refIs', ref: cx.it ?? 'self', f: fp.f } } : null; }
  return null;
}

// ---------- tokens ----------
const PRESETS = ['lander', 'heartwood', 'treasure', 'food', 'clue', 'blood', 'gold', 'powerstone', 'map', 'vibranium'];
function tokenSpec(s: string): TokenSpec | null {
  s = s.trim(); const w = s.split(' '); let i = 0; let p: number | undefined, t: number | undefined; const colors: Color[] = []; const types: string[] = []; const sub: string[] = []; let legendary = false; let named = '';
  const pt = /^(\d+)\/(\d+)$/.exec(w[i] ?? ''); if (pt) { p = +pt[1]; t = +pt[2]; i++; }
  for (; i < w.length; i++) {
    const x = w[i];
    if (x.startsWith('named:')) { named = x.slice(6).split('_').map(y => y[0].toUpperCase() + y.slice(1)).join(' '); continue; }
    if (COLOR_OF[x]) colors.push(COLOR_OF[x]); else if (x === 'and' || x === 'colorless') continue;
    else if (x === 'legendary') legendary = true;
    else if (['artifact', 'creature', 'enchantment', 'land'].includes(x)) types.push(TYPES[x]);
    else if (SUB.has(x)) sub.push(SUB.get(x)!);
    else if (PRESETS.includes(x) && w.length - i === 1 && !types.length) sub.push(x[0].toUpperCase() + x.slice(1));
    else if (/^[a-z]+$/.test(x) && !types.length && w.slice(i + 1).some(y => ['artifact', 'creature', 'enchantment'].includes(y)) && !['tapped', 'attacking', 'token', 'tokens', 'named', 'with', 'that', 'copy'].includes(x)) sub.push(x[0].toUpperCase() + x.slice(1));
    else return null;
  }
  if (!types.length && sub.length === 1 && PRESETS.includes(sub[0].toLowerCase())) return { name: sub[0], colors: sub[0] === 'Heartwood' ? ['R', 'G'] : [], types: ['Artifact'], preset: sub[0] as TokenSpec['preset'] };
  if (!types.length || (types.includes('Creature') && p === undefined)) return null;
  return { name: named || sub.join(' ') || types.join(' '), p, t, colors, types, sub, legendary: legendary || undefined };
}
function kwList(s: string): string[] | null {
  const parts = s.replace(/, and |, | and /g, '|').split('|').map(x => x.trim());
  return parts.every(p => KWS.includes(p)) ? parts : null;
}

// ---------- mana ----------
function manaAdd(s: string, cx: Cx): { mana: ManaSym[]; n?: Amt } | null {
  let m: RegExpExecArray | null; s = s.trim();
  if ((m = /^(.+?) for each (.+)$/.exec(s))) { const b = manaAdd(m[1], cx); const fe = forEach(m[2], cx); if (!b || !fe || b.n) return null; return { mana: b.mana, n: fe }; }
  if ((m = /^an amount of (\{[wubrgc]\}) equal to (.+)$/.exec(s))) { const a = amount(m[2], cx); return a === null ? null : { mana: [m[1][1].toUpperCase() as ManaSym], n: a }; }
  if (/^one mana of any colou?r$/.test(s)) return { mana: ['ANY'] };
  if (/^one mana of any colou?r in your commander's colou?r identity$/.test(s)) return { mana: ['IDENTITY'] };
  if ((m = /^(two|three|x) mana (?:of any one colou?r|in any combination of colou?rs)$/.exec(s))) { const n = num(m[1]); return n === 'X' ? { mana: ['ANY'], n: 'X' } : { mana: Array(n as number).fill('ANY') }; }
  if ((m = /^(\{[wubrgc]\}(?:, \{[wubrgc]\})*,? or \{[wubrgc]\})$/.exec(s))) return { mana: [[...s.matchAll(/\{([wubrgc])\}/g)].map(x => x[1].toUpperCase()).join('|') as ManaSym] };
  if ((m = /^((?:\{[wubrgc]\})+)$/.exec(s))) return { mana: [...s.matchAll(/\{([wubrgc])\}/g)].map(x => x[1].toUpperCase() as ManaSym) };
  if ((m = /^((?:\{[wubrgc]\})+) or ((?:\{[wubrgc]\})+)$/.exec(s))) return null;
  return null;
}

// ---------- effects ----------
const P_RE = "(you|each opponent|each player|target player|target opponent|that player|its controller|its owner|defending player|each of your opponents|they|their controller|that creature's controller|that permanent's controller|that spell's controller)";
type Pat = [RegExp, (m: RegExpExecArray, cx: Cx) => Effect[] | null];
const harmOf = (n: Amt) => typeof n === 'number' && n < 0;
function pl(m: string | undefined, cx: Cx, harm = true): PRef | null { if (!m) return 'you'; const r = playerRef(m, cx, harm); if (r && /^t\d+$/.test(r)) cx.lastPl = r; return r; }
const EMB: string[] = [];
const hashStr = (t: string) => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
/** Compile emblem text ("creatures you control get +1/+1", triggers…) into a synthetic card definition. */
function emblemDef(body: string): CardDef | null {
  const owner = CUR_NAME; const text = body.replace(/this emblem/g, '~').replace(/'([^']+)'/g, '"$1"');
  const name = `${owner.split(',')[0]} emblem`;
  const d: CardDef = { id: `emblem:${owner}:${hashStr(text)}`, name, types: ['Emblem'], cost: { generic: 0 }, colors: [], text: '' };
  const r = compile({ name, oracle_text: text, type_line: 'Emblem' }, d); CUR_NAME = owner;
  if (!r.ok) return null; d.text = pretty(text, name).replace(/^./, x => x.toUpperCase()); return d;
}
/** Compile a token's quoted ability text ("{t}: add {g}.") into the extra rules the token definition carries. */
function tokenAbil(body: string, tokName: string): TokenSpec['ext'] | null {
  const owner = CUR_NAME; const text = body.replace(/\.$/, '');
  const d: CardDef = { id: 'tokabil', name: tokName, types: ['Creature'], cost: { generic: 0 }, colors: [], text: '' };
  const r = compile({ name: tokName, oracle_text: text, type_line: 'Creature' }, d); CUR_NAME = owner;
  if (!r.ok) return null;
  return { text: pretty(text, tokName).replace(/^./, x => x.toUpperCase()) + '.', mana: d.mana, abilities: d.abilities, triggers: d.triggers, statics: d.statics, keywords: d.keywords };
}
let JACE: TokenSpec | null = null;
/** The Jace planeswalker token that "empower Jace N" creates. */
function jaceTok(): TokenSpec {
  if (JACE) return JACE; const owner = CUR_NAME;
  const d: CardDef = { id: 'jace-tok', name: 'Jace', types: ['Planeswalker'], cost: { generic: 0 }, colors: ['U'], text: '' };
  compile({ name: 'Jace', oracle_text: '−1: Surveil 1.\n−3: Draw a card.', type_line: 'Legendary Planeswalker — Jace' }, d); CUR_NAME = owner;
  return (JACE = { name: 'Jace', colors: ['U'], types: ['Planeswalker'], sub: ['Jace'], ext: { text: '[−1]: Surveil 1.\n[−3]: Draw a card.', abilities: d.abilities } });
}
const UNTIL_NEXT = (fx: Effect[] | null) => { if (!fx || !fx.length || !fx.every(e => e.op === 'pump' || e.op === 'grant')) return null; for (const e of fx) e.until = 'yourNext'; return fx; };
/** Parse the description after "becomes": "a 0/0 elemental creature with vigilance and haste that's still a land". */
function becDesc(s0: string, cx: Cx): { ce: CEFx; n?: Amt; m?: Amt } | null {
  let s = s0.trim().replace(/^(?:a|an) /, ''); let still = false;
  s = s.replace(/ (?:that's|that is) still an? (?:land|artifact|planeswalker|enchantment|creature)$| in addition to its other types$/, () => { still = true; return ''; });
  const ce: CEFx = {}; let n: Amt | undefined, m: Amt | undefined;
  const wm = /^(.+?) with (.+)$/.exec(s);
  if (wm) { s = wm[1]; const w = wm[2]; let x: RegExpExecArray | null;
    if ((x = /^base power and toughness (\d+)\/(\d+)$/.exec(w))) { n = +x[1]; m = +x[2]; }
    else if ((x = /^power and toughness each equal to (.+)$/.exec(w))) { const a = amount(x[1], cx); if (a === null) return null; n = a; m = a; }
    else if ((x = /^(?:(.+?),? and )?"([^"]+)"$/.exec(w))) { if (x[1]) { const k = kwList(x[1]); if (!k) return null; ce.addKw = k; } const ext = tokenAbil(x[2], CUR_NAME); if (!ext) return null; ce.grant = ext; }
    else { const k = kwList(w); if (!k) return null; ce.addKw = k; } }
  const w = s.split(' '); const types: string[] = []; const sub: string[] = []; const cols: Color[] = []; let colorless = false;
  let i = 0; const pt = /^(\d+)\/(\d+)$/.exec(w[0] ?? ''); if (pt) { n = +pt[1]; m = +pt[2]; i++; }
  for (; i < w.length; i++) { const x = w[i];
    if (COLOR_OF[x]) cols.push(COLOR_OF[x]); else if (x === 'colorless') colorless = true; else if (x === 'and') continue;
    else if (['artifact', 'creature', 'enchantment', 'land'].includes(x)) types.push(TYPES[x]);
    else if (SUB.has(x)) sub.push(SUB.get(x)!);
    else if (/^[a-z]+$/.test(x) && w.slice(i + 1).some(y => ['artifact', 'creature', 'enchantment', 'land'].includes(y))) sub.push(x[0].toUpperCase() + x.slice(1));
    else return null; }
  if (!types.length) return null;
  ce.addTypes = types; if (cols.length) ce.setColors = cols; else if (colorless) ce.setColors = [];
  if (sub.length) { if (still || !types.includes('Creature')) ce.addSub = sub; else ce.setCSub = sub; }
  if (types.includes('Creature') && n === undefined && !still) return null; // a creature with no stated P/T we can't model
  return { ce, n, m };
}
const BEC_UNTIL = (a?: string, b?: string): Effect['until'] => { const u = a ?? b ?? ''; return /next turn/.test(u) ? 'yourNext' : /end of turn/.test(u) ? 'eot' : undefined; };
const PATS: Pat[] = [
  [/^(?:(until end of turn|until your next turn), )?(.+?) loses all abilities and becomes an? (.+?)( until end of turn| until your next turn)?$/, (mm, cx) => { const o = obj(mm[2], cx, true); const b = becDesc(mm[3], cx); return o && !o.card && b ? [{ op: 'becomes', who: o.ref, ce: { ...b.ce, loseAll: true }, n: b.n, m: b.m, until: BEC_UNTIL(mm[1], mm[4]) }] : null; }],
  [/^(?:(until end of turn|until your next turn), )?(.+?) loses all abilities(?: and has base power and toughness (\d+)\/(\d+))?( until end of turn| until your next turn)?$/, (mm, cx) => { const o = obj(mm[2], cx, true); return o && !o.card ? [{ op: 'becomes', who: o.ref, ce: { loseAll: true }, n: mm[3] ? +mm[3] : undefined, m: mm[4] ? +mm[4] : undefined, until: BEC_UNTIL(mm[1], mm[5]) }] : null; }],
  [/^(?:(until end of turn|until your next turn), )?(.+?) (?:has|have) base power and toughness (\d+)\/(\d+)( until end of turn| until your next turn)?$/, (mm, cx) => { const o = obj(mm[2], cx, false); return o && !o.card ? [{ op: 'becomes', who: o.ref, ce: {}, n: +mm[3], m: +mm[4], until: BEC_UNTIL(mm[1], mm[5]) }] : null; }],
  [/^(.+?) becomes an? (treasure|food|clue|gold|blood) artifact with "([^"]+)" and loses all other card types and abilities$/, (mm, cx) => { const o = obj(mm[1], cx, true); const ext = tokenAbil(mm[3], CUR_NAME); return o && !o.card && ext ? [{ op: 'becomes', who: o.ref, ce: { setTypes: ['Artifact'], addSub: [mm[2][0].toUpperCase() + mm[2].slice(1)], loseAll: true, grant: ext } }] : null; }],
  [/^(?:(until end of turn|until your next turn), )?(.+?) becomes an? (.+?)( until end of turn| until your next turn)?$/, (mm, cx) => { if (mm[2] === '~' && /still a planeswalker/.test(mm[3])) return null; const o = obj(mm[2], cx, false); const b = becDesc(mm[3], cx); return o && !o.card && b ? [{ op: 'becomes', who: o.ref, ce: b.ce, n: b.n, m: b.m, until: BEC_UNTIL(mm[1], mm[4]) }] : null; }],
  [/^if (target player|target opponent) has fewer than (\w+) poison counters, they get a number of poison counters equal to the difference$/, (mm, cx) => { const p = playerRef(mm[1], cx, true); const k = num(mm[2]); return p && typeof k === 'number' ? [{ op: 'poisonTo', pl: p, n: k }] : null; }],
  [new RegExp(`^(${P_RE}) gets? (${N}) poison counters?$`), (mm, cx) => { const p = playerRef(mm[1], cx, true); const k = num(mm[2]); return p && k !== null ? [{ op: 'poison', pl: p, n: k }] : null; }],
  [/^exchange control of (target .+?) and (target .+)$/, (mm, cx) => { const a = obj(mm[1], cx, false); const b = a && obj(mm[2], cx, true); return a && b && !a.card && !b.card ? [{ op: 'exchange', who: a.ref, other: b.ref }] : null; }],
  [/^§keepone ([a-z]+)$/, mm => { const fp = parseFilter(mm[1]); return fp ? [{ op: 'keepOneEach', f: fp.f, text: mm[1] }] : null; }],
  [/^discard up to (\w+) cards, then draw that many cards$/, mm => { const k = num(mm[1]); return typeof k === 'number' ? [{ op: 'discard', n: k, pl: 'you', upTo: true }, { op: 'draw', n: 'chosen', pl: 'you' }] : null; }],
  [/^return (?:that card|it) to the battlefield(?: under (?:its owner's|your) control)? at the beginning of the next end step$/, (_m, cx) => [{ op: 'delayRet', who: cx.that ?? cx.it ?? 'ev', zone: 'graveyard' }]],
  [/^§uginx (?:a |an )?(.+?) tokens?$/, mm => { const t = tokenSpec(mm[1]); return t ? [{ op: 'exileLinkTok', tok: t }] : null; }],
  [/^§exilecast (free)?\|(.+)$/, (mm, cx) => { const e = clause(mm[2], cx); return e ? [{ op: 'exileTopCast', free: !!mm[1], else: e }] : null; }],
  [/^§searchexilefree (.+)$/, mm => { const fp = parseFilter(mm[1] + ' card'); return fp ? [{ op: 'search', n: 99, f: fp.f, dest: 'exile', text: mm[1] + ' card' }, { op: 'mayCastFree', who: 'chosen' }] : null; }],
  [/^add (\w+) mana of any one color$/, mm => { const k = num(mm[1]); return typeof k === 'number' ? [{ op: 'addManaOne', n: k }] : null; }],
  [/^(you|target opponent|target player|each opponent) gets? emblem#(\d+)$/, (m, cx) => { const d = emblemDef(EMB[+m[2]]); const p = m[1] === 'you' ? 'you' : playerRef(m[1], cx, m[1] !== 'target player'); return d && p ? [{ op: 'emblem', pl: p, emb: d }] : null; }],
  [/^gain control of (.+?)( until end of turn)?$/, (m, cx) => { const o = obj(m[1], cx, true); return o && !o.card ? [{ op: 'steal', who: o.ref, until: m[2] ? 'eot' : undefined }] : null; }],
  [/^(?:you )?take (an|two|three) extra turns? after this one$/, m => [{ op: 'extraTurn', n: num(m[1]) as number }]],
  [/^destroy all other permanents except for lands and tokens$/, () => [{ op: 'destroy', who: { all: { other: true, notTypes: ['Land'], nontoken: true } } }]],
  [/^(~|it) deals (\d+) damage to (.+?) and (\d+) damage to (.+)$/, (m, cx) => { const a = dmg(m[1], +m[2], m[3], cx); const b = a && dmg(m[1], +m[4], m[5], cx); return a && b ? [...a, ...b] : null; }],
  [/^amass (?:([a-z]+) )?(\d+)$/, m => [{ op: 'amass', n: +m[2], text: m[1] ? m[1][0].toUpperCase() + m[1].slice(1) : undefined }]],
  [new RegExp(`^(${P_RE}) loses? the game$`), (m, cx) => { const p = playerRef(m[1], cx); return p ? [{ op: 'loseGame', pl: p }] : null; }],
  [/^(?:return|put) all (.+?)(?: cards?)? (?:from|in) (your|all) graveyards? (?:to|onto) the battlefield( tapped)?(?: under your control)?$/, (m, cx) => { void cx; const fp = parseFilter(/\bcards?\b/.test(m[1]) ? m[1] : m[1] + ' cards'); if (!fp) return null; const f = { ...fp.f, ...(m[2] === 'your' ? { ctrl: 'you' as const } : {}) }; return [{ op: 'ret', who: { all: f, zone: 'graveyard' }, dest: 'battlefield', tapped: !!m[3], ctl: 'you' }]; }],
  [/^return all (.+?) cards? from your graveyard to your hand$/, m => { const fp = parseFilter(m[1] + ' cards'); return fp ? [{ op: 'ret', who: { all: { ...fp.f, ctrl: 'you' }, zone: 'graveyard' }, dest: 'hand' }] : null; }],
  [new RegExp(`^(${P_RE})(?:'s)? life totals? becomes? (\\d+)$`), (m, cx) => { const p = playerRef(m[1].replace(/'s$/, ''), cx); return p ? [{ op: 'lifeBecomes', n: +m[m.length - 1], pl: p }] : null; }],
  [/^(?:until end of turn, )?~ becomes an? (\d+)\/(\d+) (?:[a-z ]+ )?creature(?: with ([a-z ,]+?))? that's still a planeswalker(?: until end of turn)?( §prevent)?$/, m => { const kw = m[3] ? kwList(m[3]) : []; if (kw === null) return null; return [{ op: 'animate', n: +m[1], m: +m[2], kw, eot: !!m[4] }]; }],
  [/^~ deals (\d+) damage to target (player|opponent)(?: or planeswalker)? and each creature( and planeswalker)? (?:that player|they|that player or that planeswalker's controller) controls?$/, (m, cx) => { addSlot(cx, { who: m[1] && /or planeswalker/.test(m[0]) ? 'any' : m[2] === 'opponent' ? 'opp' : 'player', harm: true }); return [{ op: 'dmgPlayerAndCreatures', n: +m[1], f: m[3] ? { types: ['Planeswalker'] } : undefined }]; }],
  [/^until your next turn, you may cast sorcery spells as though they had flash$/, () => [{ op: 'flashSorc' }]],
  [/^creature spells you cast this turn can't be countered$/, () => [{ op: 'uncCreatures' }]],
  [/^until end of turn, if one or more tokens would be created under your control, twice that many of those tokens are created instead$/, () => [{ op: 'tokDouble' }]],
  [/^you win the game$/, () => [{ op: 'winGame' }]],
  [/^§looktb (.+)$/, (m, cx) => { const p = playerRef(m[1], cx, false); return p ? [{ op: 'lookTopMayBottom', pl: p }] : null; }],
  [/^exile all cards from (target player's|target opponent's|each opponent's) library$/, (m, cx) => { const p = playerRef(m[1].replace(/'s$/, ''), cx, true); if (p && /^t\d+$/.test(p)) cx.lastPl = p; return p ? [{ op: 'exileLibrary', pl: p }] : null; }],
  [/^(that player|target player|each player|each opponent) shuffles (?:their|his or her) hand into (?:their|his or her) library$/, (m, cx) => { const p = playerRef(m[1], cx, true); return p ? [{ op: 'shuffleHandIn', pl: p }] : null; }],
  [/^each opponent chooses a permanent they control of each permanent type and sacrifices the rest$/, () => [{ op: 'keepEachType', pl: 'opps' }]],
  [/^separate all permanents (target player|target opponent) controls into two piles§ that player sacrifices all permanents in the pile$/, (m, cx) => { const p = playerRef(m[1], cx, true); return p ? [{ op: 'piles', pl: p }] : null; }],
  [/^until your next turn, (.+)$/, (m, cx) => { const n = cx.slots.length; const a = UNTIL_NEXT(clause(m[1], cx)); if (a) return a; cx.slots.length = n; return UNTIL_NEXT(clause(m[1] + ' until end of turn', cx)); }],
  [/^(.+?) can't attack or block (?:this turn|until end of turn)$/, (m, cx) => { const o = obj(m[1], cx, true); return o && !o.card ? [{ op: 'grant', who: o.ref, kw: ['_cantattack', '_cantblock'] }] : null; }],
  [/^put an? (\+1\/\+1|loyalty) counter on each (.+?) and an? (\+1\/\+1|loyalty) counter on each (.+)$/, (m, cx) => { const a = obj('each ' + m[2], cx, false); const b = obj('each ' + m[4], cx, false); return a && b ? [{ op: 'addC', kind: m[1], n: 1, who: a.ref }, { op: 'addC', kind: m[3], n: 1, who: b.ref }] : null; }],
  [/^(.+) until your next turn$/, (m, cx) => UNTIL_NEXT(clause(m[1] + ' until end of turn', cx))],
  [/^(?:shuffle(?: your library)?|then shuffle|(?:it|they) can't be regenerated)$/, () => []],
  [new RegExp(`^(?:${P_RE} )?draws? (${N}|that many|x) cards?(?: for each (.+))?$`), (m, cx) => { const p = pl(m[1], cx, false); const a = num(m[2]) ?? (m[2] === 'that many' ? 'ev' : null); if (!p || a === null) return null; const n = withForEach(a, m[3], cx); return n === null ? null : [{ op: 'draw', n, pl: p }]; }],
  [new RegExp(`^(?:${P_RE} )?draws? cards equal to (.+)$`), (m, cx) => { const p = pl(m[1], cx, false); const a = amount(m[2], cx); return p && a !== null ? [{ op: 'draw', n: a, pl: p }] : null; }],
  [new RegExp(`^(?:${P_RE} )?discards? (${N}|that many) cards?( at random)?$`), (m, cx) => { const p = pl(m[1], cx); const a = num(m[2]) ?? 'ev'; return p ? [{ op: 'discard', n: a, pl: p, random: !!m[3] }] : null; }],
  [new RegExp(`^(?:${P_RE} )?discards? (?:their|your) hand$`), (m, cx) => { const p = pl(m[1], cx); return p ? [{ op: 'discard', n: 99, pl: p }] : null; }],
  [new RegExp(`^(?:${P_RE} )?mills? (two|three|four) times x cards$`), (m, cx) => { const p = pl(m[1], cx, false); return p ? [{ op: 'mill', n: { mul: num(m[2]) as number, of: 'X' }, pl: p }] : null; }],
  [new RegExp(`^(?:${P_RE} )?mills? (${N}|that many) cards?$`), (m, cx) => { const p = pl(m[1], cx, false); return p ? [{ op: 'mill', n: num(m[2]) ?? 'ev', pl: p }] : null; }],
  [new RegExp(`^(?:${P_RE} )?gains? (${N}|that much|x) life(?: for each (.+))?$`), (m, cx) => { const p = pl(m[1], cx, false); const a = num(m[2]) ?? 'ev'; const n = withForEach(a, m[3], cx); return p && n !== null ? [{ op: 'gain', n, pl: p }] : null; }],
  [new RegExp(`^(?:${P_RE} )?gains? life equal to (.+)$`), (m, cx) => { const p = pl(m[1], cx, false); const a = amount(m[2], cx); return p && a !== null ? [{ op: 'gain', n: a, pl: p }] : null; }],
  [new RegExp(`^(?:${P_RE} )?loses? (${N}|that much|x) life(?: for each (.+))?$`), (m, cx) => { const p = pl(m[1], cx); const a = num(m[2]) ?? 'ev'; const n = withForEach(a, m[3], cx); return p && n !== null ? [{ op: 'lose', n, pl: p }] : null; }],
  [new RegExp(`^(?:${P_RE} )?loses? life equal to (.+)$`), (m, cx) => { const p = pl(m[1], cx); const a = amount(m[2], cx); return p && a !== null ? [{ op: 'lose', n: a, pl: p }] : null; }],
  // damage
  [/^(~|it|.+?) deals? (x|\d+|that much) damage to (.+?)(?: for each (.+))?$/, (m, cx) => dmg(m[1], num(m[2]) ?? 'ev', m[3], cx, m[4])],
  [/^(~|it|.+?) deals? damage equal to (.+?) to (.+)$/, (m, cx) => { if (m[1] !== '~' && m[1] !== 'it') { const src = obj(m[1], cx, false); if (!src) return null; const a = amount(m[2], cx); if (!a || typeof a !== 'object' || !('pow' in a)) return null; const t = obj(m[3], cx, true); if (!t) return null; return [{ op: 'bite', who: src.ref, other: t.ref }]; } const a = amount(m[2], cx); return a === null ? null : dmg(m[1], a, m[3], cx); }],
  [/^(.+?) deals? damage to (.+?) equal to (.+)$/, (m, cx) => { const a = amount(m[3], cx); return a === null ? null : dmg(m[1], a, m[2], cx); }],
  [/^destroy (target [a-z ]+?) and (target [a-z ]+)$/, (m, cx) => { const a = obj(m[1], cx, true); const b = a && obj(m[2], cx, true); return a && b && !a.card && !b.card ? [{ op: 'destroy', who: a.ref }, { op: 'destroy', who: b.ref }] : null; }],
  [/^destroy (.+?)$/, (m, cx) => { const o = obj(m[1], cx, true); return o && !o.card ? [{ op: 'destroy', who: o.ref }] : null; }],
  [/^exile (.+?)(?: until ~ leaves the battlefield)?$/, (m, cx) => { if (/until/.test(m[0])) return null; const o = obj(m[1], cx, true); return o ? [{ op: 'exile', who: o.ref }] : null; }],
  [/^return (a|an) (land|creature|permanent|nonland permanent|artifact|enchantment) you control to its owner's hand$/, m => { const fp = parseFilter(m[2]); return fp ? [{ op: 'sac', f: { ...fp.f, ctrl: 'you' }, n: 1, pl: 'you', dest: 'hand' }] : null; }],
  [/^return (.+?) to (?:its owner's|their owners'|your|their owner's) hands?$/, (m, cx) => { const o = (/\btarget .*graveyard$/.test(m[1]) ? obj(m[1], cx, false) : null) ?? obj(m[1].replace(/ from your graveyard$| from a graveyard$/, ''), cx, !/graveyard/.test(m[1])); if (!o) { const o2 = gyObj(m[1], cx); return o2 ? [{ op: 'ret', who: o2, dest: 'hand' }] : null; } return [{ op: o.card || /graveyard/.test(m[1]) ? 'ret' : 'bounce', who: o.ref, dest: 'hand' }]; }],
  [/^return (.+?) to the battlefield( tapped)?(?: under (your|its owner's|their owners'|their owner's) control)?( tapped)?$/, (m, cx) => { const o = (/\btarget .*graveyard$/.test(m[1]) ? obj(m[1], cx, false) : null) ?? obj(m[1].replace(/ from your graveyard$| from a graveyard$/, ''), cx, false) ?? (gyObj(m[1], cx) ? { ref: gyObj(m[1], cx)! } : null); return o ? [{ op: 'ret', who: o.ref, dest: 'battlefield', tapped: !!(m[2] || m[4]), ctl: m[3] === 'your' ? 'you' : undefined }] : null; }],
  [/^put (target .+? card from (?:a|your|an opponent's) graveyard) onto the battlefield( tapped)? under your control$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'ret', who: o.ref, dest: 'battlefield', tapped: !!m[2], ctl: 'you' }] : null; }],
  [/^exile (target player's|each opponent's|each player's|all|all opponents') graveyards?$/, (m, cx) => { const p = m[1] === 'all' ? 'all' : playerRef(m[1].replace(/'s?$/, ''), cx, true); return p ? [{ op: 'exileGrave', pl: p }] : null; }],
  [/^(?:then )?put (two|three|a|one) cards? from your hand on top of your library(?: in any order)?$/, m => [{ op: 'putBack', n: num(m[1])! }]],
  [/^untap (?:up to )?(one|two|three|four|five) lands$/, m => [{ op: 'untapLands', n: num(m[1])! }]],
  [/^counter (target .+?) unless its controller pays \{(\d+|x)\}$/, (m, cx) => { const o = obj(m[1], cx, true); if (!o) return null; const g = m[2] === 'x' ? 0 : +m[2]; return [{ op: 'unless', pl: 'ctl:t0', ifPaid: { generic: g, x: m[2] === 'x' ? 1 : 0 }, text: 'the spell is countered', sub: [{ op: 'counter', who: o.ref }] }]; }],
  [/^put (.+?) on (top|the bottom) of (?:its owner's|their owners'|your) librar(?:y|ies)$/, (m, cx) => { const o = obj(m[1], cx, true); return o ? [{ op: 'tuck', who: o.ref, dest: m[2] === 'top' ? 'top' : 'bottom' }] : null; }],
  [/^(tap|untap) (.+)$/, (m, cx) => { const o = obj(m[2], cx, m[1] === 'tap'); return o && !o.card ? [{ op: m[1], who: o.ref }] : null; }],
  [/^counter (target .+)$/, (m, cx) => { const o = obj(m[1], cx, true); return o && (cx.slots[cx.slots.length - 1].who === 'spell' || cx.slots[cx.slots.length - 1].who === 'ability') ? [{ op: 'counter', who: o.ref }] : null; }],
  [new RegExp(`^put (${N}|that many|x|an additional) ([+-]\\d\\/[+-]\\d|[a-z]+) counters? on (.+?)(?: for each (.+))?$`), (m, cx) => { const k = m[2]; const harm = k === '-1/-1'; const o = obj(m[3], cx, harm); const a = m[1] === 'an additional' ? 1 : num(m[1]) ?? 'ev'; const n = withForEach(a, m[4], cx); return o && !o.card && n !== null ? [{ op: 'addC', kind: k, n, who: o.ref }] : null; }],
  [/^remove (a|an|one|two|three|x|all) ([+-]\d\/[+-]\d|[a-z]+) counters? from (.+)$/, (m, cx) => { const o = obj(m[3], cx, false); return o ? [{ op: 'remC', kind: m[2], n: m[1] === 'all' ? 99 : num(m[1])!, who: o.ref }] : null; }],
  [/^proliferate$/, () => [{ op: 'proliferate' }]],
  [/^you become the monarch$/, () => [{ op: 'monarch', pl: 'you' }]],
  [/^choose a creature type( §keep)?$/, m => [{ op: 'chooseType', text: m[1] ? 'keep' : undefined }]],
  [new RegExp(`^put (${N}) ([+-]\\d\\/[+-]\\d|[a-z]+) counters? on (.+?) and (${N}) ([+-]\\d\\/[+-]\\d|[a-z]+) counters? on (.+)$`), (m, cx) => { const a = obj(m[3], cx, m[2] === '-1/-1'); const b = a && obj(m[6], cx, m[5] === '-1/-1'); const x = num(m[1]), y = num(m[4]); return a && b && !a.card && !b.card && typeof x === 'number' && typeof y === 'number' ? [{ op: 'addC', kind: m[2], n: x, who: a.ref }, { op: 'addC', kind: m[5], n: y, who: b.ref }] : null; }],
  [/^(.+?) becomes? (?:artifact )?creatures? with base power and toughness (\d+)\/(\d+) until end of turn$/, (m, cx) => { const o = obj(m[1], cx, false); return o && !o.card ? [{ op: 'animAll', who: o.ref, n: +m[2], m: +m[3] }] : null; }],
  [/^(that creature|it) is an? ((?:white|blue|black|red|green) )?([a-z]+) in addition to its other (?:colors and )?types$/, (m, cx) => { const o = obj(m[1], cx, false); const sub = SUB.get(m[3]); return o && sub ? [{ op: 'addType', who: o.ref, kw: [sub], mana: m[2] ? [COLOR_OF[m[2].trim()]] : undefined }] : null; }],
  [/^put (.+?) into its owner's library (second|third) from the top$/, (m, cx) => { const o = obj(m[1], cx, true); return o && !o.card ? [{ op: 'tuck', who: o.ref, dest: 'top', n: m[2] === 'second' ? 1 : 2 }] : null; }],
  [/^§lookone ([a-z ]+)$/, m => { const fp = parseFilter(m[1] + ' card'); return fp ? [{ op: 'look', n: 1, take: 1, f: fp.f, dest: 'hand', rest: 'top', text: m[1] + ' card' }] : null; }],
  [/^§revtop (\w+)\|([a-z ]+)\|([a-z ]+)\|([a-z ]+)$/, m => { const n = num(m[1]); const fp = parseFilter(m[2] + ' card'); if (typeof n !== 'number' || !fp) return null; return [{ op: 'revealTop', n, f: fp.f, dest: m[3].startsWith('onto') ? 'battlefield' : 'hand', tapped: /tapped/.test(m[3]), rest: m[4].startsWith('on the bottom') ? 'bottom' : m[4] === 'into your graveyard' ? 'graveyard' : 'hand', text: m[2] }]; }],
  [/^§revuntil ([a-z ]+)\|([a-z ]+)$/, m => { const fp = parseFilter(m[1] + ' card'); return fp ? [{ op: 'revealUntil', f: fp.f, dest: m[2].startsWith('onto') ? 'battlefield' : 'hand', text: m[1] }] : null; }],
  [/^(.+?) becomes (un)?prepared$/, (m, cx) => { const o = obj(m[1], cx, false); return o && !o.card ? [{ op: 'prep', who: o.ref, n: m[2] ? 0 : 1 }] : null; }],
  [/^§mobilize (\d+)$/, m => [{ op: 'token', n: +m[1], pl: 'you', tok: { name: 'Warrior', p: 1, t: 1, colors: ['R'], types: ['Creature'], sub: ['Warrior'] }, tapped: true, attacking: true }, { op: 'delaySac', who: 'created' }]],
  [/^§firebend (\w+)$/, (m, cx) => { const n = num(m[1]) ?? amount(m[1], cx); return n === null ? null : [{ op: 'fireMana', n }]; }],
  [/^recruit$/, (_m, cx) => { const tok = clause('create a 1/1 white human soldier creature token', cx); return tok ? [{ op: 'draw', n: 1, pl: 'you' }, { op: 'chosenReset' }, { op: 'discard', n: 1, pl: 'you' }, { op: 'if', cond: { k: 'chosenNonland' }, sub: tok }] : null; }],
  [/^§jobselect$/, () => [{ op: 'token', n: 1, pl: 'you', tok: { name: 'Hero', p: 1, t: 1, colors: [], types: ['Creature'], sub: ['Hero'] } }, { op: 'attach', who: 'self', other: 'created' }]],
  [/^empower jace (.+)$/, (m, cx) => { const n0 = num(m[1]); const n = n0 !== null ? n0 : amount(m[1], cx); return n !== null ? [{ op: 'empower', n, tok: jaceTok() }] : null; }],
  [/^investigate$/, () => [{ op: 'token', n: 1, pl: 'you', tok: { name: 'Clue', colors: [], types: ['Artifact'], preset: 'Clue' } }]],
  [new RegExp(`^(?:${P_RE} )?creates? (${N}|that many|x) (tapped )?(.+?) tokens?(?: with (.+?))?( that are tapped and attacking| that's tapped and attacking| tapped and attacking)?(?: for each (.+))?$`), (m, cx) => {
    const p = pl(m[1], cx, false); const a = num(m[2]) ?? 'ev'; if (!p) return null;
    const cda = !!m[5] && /"~'s power and toughness are each equal to/.test(m[5]); const tok = tokenSpec(m[4]) ?? (cda ? tokenSpec('0/0 ' + m[4]) : null); if (!tok) return null;
    if (m[5]) { const q = /^(?:(.+?),? and )?"([^"]+)"$/.exec(m[5]); if (q) { if (q[1]) { const kws = kwList(q[1]); if (!kws) return null; tok.kws = kws; } const ext = tokenAbil(q[2], tok.name); if (!ext) return null; tok.ext = ext; } else { const kws = kwList(m[5]); if (!kws) return null; tok.kws = kws; } }
    const n = withForEach(a, m[7], cx); if (n === null) return null;
    return [{ op: 'token', n, pl: p, tok, tapped: !!m[3] || !!m[6], attacking: !!m[6] }];
  }],
  [/^create (?:a|one) token that's a copy of (.+)$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'copyTok', n: 1, who: o.ref }] : null; }],
  [/^(.+?) (?:gets?|get) ([+-](?:\d+|x))\/([+-](?:\d+|x))(?: and (?:gains?|gain) (.+?))? until end of turn(?: for each (.+))?$/, (m, cx) => pump(m, cx)],
  [/^(.+?) (?:gets?|get) ([+-](?:\d+|x))\/([+-](?:\d+|x)) for each (.+?) until end of turn$/, (m, cx) => pump([m[0], m[1], m[2], m[3], undefined, m[4]] as unknown as RegExpExecArray, cx)],
  [/^until end of turn, (.+?) (?:gets?|get) ([+-](?:\d+|x))\/([+-](?:\d+|x))(?: and (?:gains?|gain) (.+?))?$/, (m, cx) => pump(m, cx)],
  [/^(.+?) (?:gains?|gain) (.+?) until end of turn$/, (m, cx) => { const k = kwList(m[2]); const o = obj(m[1], cx, false); return k && o ? [{ op: 'grant', who: o.ref, kw: k }] : null; }],
  [/^until end of turn, (.+?) (?:gains?|gain) (.+?)$/, (m, cx) => { const k = kwList(m[2]); const o = obj(m[1], cx, false); return k && o ? [{ op: 'grant', who: o.ref, kw: k }] : null; }],
  [/^(.+?) can't block this turn$/, (m, cx) => { const o = obj(m[1], cx, true); return o ? [{ op: 'grant', who: o.ref, kw: ['_cantblock'] }] : null; }],
  [/^(.+?) can't be blocked this turn$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'grant', who: o.ref, kw: ['_unblockable'] }] : null; }],
  [/^(.+?) (?:fights|fight) (.+)$/, (m, cx) => { const a = obj(m[1], cx, false); const b = obj(m[2], cx, true); return a && b ? [{ op: 'fight', who: a.ref, other: b.ref }] : null; }],
  [/^add (.+)$/, (m, cx) => { const r = manaAdd(m[1], cx); return r ? [{ op: 'addMana', mana: r.mana as string[], n: r.n ?? 1 }] : null; }],
  [/^goad (.+)$/, (m, cx) => { const o = obj(m[1], cx, true); return o ? [{ op: 'goad', who: o.ref }] : null; }],
  [/^regenerate (.+)$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'regen', who: o.ref }] : null; }],
  [/^(scry|surveil) (\w+)$/, m => { const n = num(m[2]); return n === null ? null : [{ op: m[1], n }]; }],
  [/^(.+?) endures? (\d+)$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'endure', n: +m[2], who: o.ref }] : null; }],
  [/^put your commander into your hand from the command zone$/, () => [{ op: 'cmdrToHand' }]],
  [/^earthbend (\d+)$/, (m, cx) => [{ op: 'earthbend', n: +m[1], who: addSlot(cx, { who: 'perm', f: { ctrl: 'you', types: ['Land'] }, harm: false, opt: false }) }]],
  [new RegExp(`^(?:${P_RE} )?blights? (\\d+)$`), (m, cx) => { const p = pl(m[1], cx); return p ? [{ op: 'blight', n: +m[2], pl: p }] : null; }],
  [/^transform ~$/, () => [{ op: 'transform', who: 'self' }]],
  [/^exile ~, then return (?:it|~) to the battlefield transformed under your control$/, () => [{ op: 'exileRetT', who: 'self' }]],
  [/^(.+?) explores?$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'explore', who: o.ref }] : null; }],
  [/^sacrifice ~$/, () => [{ op: 'sacThis' }]],
  [new RegExp(`^(?:${P_RE} )?sacrifices? (${N}|another) (.+)$`), (m, cx) => { const p = pl(m[1], cx); const n = m[2] === 'another' ? 1 : num(m[2]); const fp = parseFilter(m[3]); if (!p || n === null || !fp) return null; if (m[2] === 'another') fp.f.other = true; return [{ op: 'sac', n, pl: p, f: fp.f, text: m[3] }]; }],
  [/^(?:you may )?play an additional land (?:this turn|on each of your turns)$/, () => [{ op: 'extraLand', n: 1 }]],
  [/^put (a|an|up to (?:one|two|three|four|five|six|seven)|any number of) (.+?) cards? from your hand onto the battlefield( tapped)?$/, (m, cx) => { const fp = parseFilter(m[2]); return fp ? [{ op: 'putLand', f: fp.f, n: m[1] === 'any number of' ? 99 : /^up to /.test(m[1]) ? num(m[1].slice(6)) as number : 1, tapped: !!m[3], text: `${m[1]} ${m[2]} card` }] : null; }],
  [/^attach (?:~|it) to (.+)$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'attach', who: 'self', other: o.ref }] : null; }],
  [/^search your library for (a|an|one|two|three|any number of|up to (?:one|two|three|four|five|x)) (.+?) cards?(?: with (?:different names|the same name))?, (?:reveal (?:it|them|that card|those cards), )?(?:and )?put (?:it|them|that card|those cards|the card) (onto the battlefield( tapped)?|into your hand|on top of your library)(?:,? then shuffle| and shuffle)?$/, (m, cx) => search(m[1], m[2], m[3], !!m[4])],
  [/^search your library for (a|an|one) card,? (?:then )?(?:reveal it, )?(?:then )?(?:shuffle(?: and|,)? )?(?:put|and put) (?:that card|it) (into your hand|on top(?: of your library)?)(?:,? then shuffle)?$/, m => search(m[1], 'card', m[2].startsWith('on top') ? 'on top of your library' : m[2], false)],
  [/^search your library for (a|an|one|two|three|up to (?:one|two|three)) (.+?) cards?, (?:reveal (?:it|them|those cards), )?(?:then )?shuffle,? and put (?:that card|the card|it|them) (on top|into your hand|onto the battlefield)(?: of your library)?$/, (m, cx) => search(m[1], m[2], m[3] === 'on top' ? 'on top of your library' : m[3], false)],
  [/^search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand(?:, then shuffle)?$/, () => [{ op: 'search', n: 2, f: { types: ['Land'], basic: true }, dest: 'battlefield', tapped: true, take: 1, rest: 'hand', text: 'basic land card' }]],
];
function gyObj(s: string, cx: Cx): Ref | null {
  if (/^~ from your graveyard$/.test(s)) return 'self';
  if (/^(it|that card|the exiled card)( from your graveyard)?$/.test(s)) return cx.that ?? cx.it ?? 'self';
  return null;
}
function search(nw: string, noun = 'card', dest: string, tapped: boolean): Effect[] | null {
  const n = nw === 'any number of' ? 99 : /up to/.test(nw) ? num(nw.replace('up to ', '')) : num(nw); if (n === null) return null;
  const fp = parseFilter(noun === 'card' ? 'card' : / with /.test(noun) ? noun.replace(' with ', ' card with ') : noun + ' card'); if (!fp) return null;
  return [{ op: 'search', n, f: fp.f, dest: dest.startsWith('onto') ? 'battlefield' : dest.startsWith('on top') ? 'top' : 'hand', tapped, text: noun === 'card' ? 'card' : / with /.test(noun) ? noun.replace(' with ', ' card with ').replace(/\bx\b/, 'X') : `${noun} card` }];
}
function pump(m: RegExpExecArray, cx: Cx): Effect[] | null {
  const P = m[2] === '+x' ? 'X' : m[2] === '-x' ? { mul: -1, of: 'X' } : +m[2]; const T = m[3] === '+x' ? 'X' : m[3] === '-x' ? { mul: -1, of: 'X' } : +m[3];
  const harm = harmOf(T as Amt); const o = obj(m[1], cx, harm); if (!o || o.card) return null;
  let p: Amt = P as Amt, t: Amt = T as Amt;
  if (m[5]) { const fe = forEach(m[5], cx); if (!fe) return null; p = typeof P === 'number' ? (P === 0 ? 0 : { mul: P, of: fe }) : (null as unknown as Amt); t = typeof T === 'number' ? (T === 0 ? 0 : { mul: T, of: fe }) : (null as unknown as Amt); if (p === null || t === null) return null; }
  const out: Effect[] = [{ op: 'pump', who: o.ref, n: p, m: t }];
  if (m[4]) { const k = kwList(m[4]); if (!k) return null; out.push({ op: 'grant', who: o.ref, kw: k }); }
  return out;
}
function dmg(srcS: string, n: Amt, toS: string, cx: Cx, fe?: string): Effect[] | null {
  if (srcS !== '~' && srcS !== 'it' && !/^(that creature|enchanted creature|equipped creature)$/.test(srcS)) {
    if (srcS === 'this spell' || srcS === 'this ability') { /* same */ } else return null;
  }
  if (fe) { const a = withForEach(n, fe, cx); if (a === null) return null; n = a; }
  const out: Effect[] = [];
  for (const part of toS.split(/,? and (?=each|target|you\b|any|that)/)) {
    const p = /^target /.test(part) ? null : playerRef(part, cx, true);
    if (p && !/^target /.test(part)) { out.push({ op: 'damage', n, pl: p }); continue; }
    if (part === 'target player' || part === 'target opponent' || part === 'each opponent' || part === 'each player') { const pr = playerRef(part, cx, true); if (!pr) return null; out.push({ op: 'damage', n, pl: pr }); continue; }
    const o = obj(part.replace(/^each other creature$/, 'each other creature'), cx, true); if (!o) return null;
    out.push({ op: 'damage', n, who: o.ref });
  }
  return out;
}

function clause(s: string, cx: Cx): Effect[] | null {
  s = s.trim().replace(/^then /, '').replace(/\.$/, '').replace(/\beach of (up to \w+|\w+) target\b/, '$1 target')
    .replace(/ (tokens?) named ([a-z'-]+(?: [a-z'-]+){0,3}?)(?= with |$| that )/, (_, t, nm) => ` named:${nm.replace(/ /g, '_')} ${t}`);
  if (!s) return [];
  let m: RegExpExecArray | null;
  if ((m = /^if (.+?), (.+)$/.exec(s))) { const c = cond(m[1], cx); const sub = c && clause(m[2], cx); if (c && sub) return [{ op: 'if', cond: c, sub }]; }
  if ((m = /^for each ([^,]+), (.+)$/.exec(s)) && !/ for each /.test(m[2])) { const save = cx.slots.length; const r = clause(`${m[2]} for each ${m[1]}`, cx); if (r) return r; cx.slots.length = save; }
  if ((m = /^(.+?) §gainlost$/.exec(s))) { const a = clause(m[1], cx); return a ? [...a, { op: 'gain', n: { lostWay: true }, pl: 'you' }] : null; }
  if ((m = /^(.+?) §ifdid (.+)$/.exec(s))) { const a = clause(m[1], cx); const b = a && clause(m[2], cx); return a && b ? [{ op: 'ifDid', sub: a, else: b }] : null; }
  if ((m = /^you may pay \{(\d+)\} §ifdo (.+)$/.exec(s))) { const sub = clause(m[2], cx); return sub ? [{ op: 'may', text: `pay {${m[1]}} to ${m[2]}`, ifPaid: { generic: +m[1] }, sub }] : null; }
  if ((m = /^you may (.+?) §ifdo (.+)$/.exec(s))) { const a = clause(m[1], cx); const b = a && clause(m[2], cx); return a && b ? [{ op: 'may', text: m[1], sub: [...a, ...b] }] : null; }
  if ((m = /^(.+), where x is (.+)$/.exec(s))) { const a = amount(m[2], cx); const sub = a !== null && clause(m[1], cx); if (sub) { const fix = (e: Effect) => { for (const k of ['n', 'm'] as const) if (e[k] === 'X') e[k] = a!; e.sub?.forEach(fix); }; sub.forEach(fix); return sub; } }
  if ((m = /^you may (.+)$/.exec(s)) && !/^you may play an additional land/.test(s)) { const sub = clause(m[1], cx); if (sub) return [{ op: 'may', text: m[1], sub }]; return null; }
  if ((m = new RegExp(`^${P_RE} may (.+)$`).exec(s))) { const p = playerRef(m[1], cx); const sub = clause(m[2].replace(/their library/g, 'your library'), { ...cx, lastPl: p ?? undefined }); if (p && sub) { for (const e of sub) if (e.pl === 'you' || (e.op === 'search' && !e.pl)) e.pl = p; return [{ op: 'may', pl: p, text: m[2], sub }]; } }
  if ((m = /^(.+?) unless (that player|its controller|they|he or she|any player) pays? \{(\d+)\}$/.exec(s))) { const sub = clause(m[1], cx); const ft = sub?.find(e => typeof e.who === 'string' && /^t\d+$/.test(e.who as string))?.who as string | undefined; const p = m[2] === 'any player' ? null : m[2] === 'its controller' && ft ? `ctl:${ft}` : playerRef(m[2] === 'they' || m[2] === 'he or she' ? 'that player' : m[2], cx, true); if (sub && p) return [{ op: 'unless', pl: p, ifPaid: { generic: +m[3] }, text: m[1], sub }]; }
  if ((m = /^(that player|they|each opponent) may pay \{(\d+)\}\. if (?:the player|they|that player) (?:doesn't|don't|do not|does not), (.+)$/.exec(s))) { const sub = clause(m[3], cx); const p = playerRef(m[1] === 'they' ? 'that player' : m[1], cx, true); if (sub && p) return [{ op: 'unless', pl: p, ifPaid: { generic: +m[2] }, text: m[3], sub }]; }
  for (const [re, fn] of PATS) { const mm = re.exec(s); if (mm) { const save = cx.slots.length; const r = fn(mm, cx); if (r) return r; cx.slots.length = save; } }
  // split compound clauses: "X and Y", "X, then Y", "X, Y, and Z"
  const seps = [/, then /g, /\. then /g, / and then /g, /, and /g, / and /g, /, /g];
  for (const sep of seps) {
    const idx = [...s.matchAll(sep)].map(x => [x.index!, x[0].length] as const);
    for (const [i, len] of idx) {
      const save = cx.slots.length; const a = clause(s.slice(0, i), cx); if (!a) { cx.slots.length = save; continue; }
      let right = s.slice(i + len);
      if (/^(draw|lose|gain|discard|mill|create|scry|surveil|sacrifice)\b/.test(right) && a[0]?.pl && a[0].pl !== 'you' && /^(lose|gain|discard|draw)/.test(right)) right = `${['opps', 'all'].includes(a[0].pl) ? (a[0].pl === 'opps' ? 'each opponent' : 'each player') : 'you'} ${right}`;
      const b = clause(right, cx); if (b) return [...a, ...b]; cx.slots.length = save;
    }
  }
  return null;
}
/** Parse a block of effect sentences. */
export function effects(text: string, cx: Cx): Effect[] | null {
  let t = text.trim().replace(/\.$/, '').replace(/\bnoncreature, nonland\b/g, 'noncreature nonland').replace(/(search your library for (?:a|an) [a-z ]+?) card (with mana value (?:x|\d+) or less),/, '$1 $2 card,');
  const out: Effect[] = [];
  { const gm = /^(create .+?), then mill a card\. if an? ([a-z]+) card was milled this way, put a loyalty counter on ~ and repeat this process$/.exec(t);
    if (gm) { const a = clause(gm[1], cx); const fp = parseFilter(gm[2] + ' card'); return a && fp ? [{ op: 'repeatWhile', sub: [...a, { op: 'mill', n: 1, pl: 'you' }], f: fp.f, rt: { label: '', effects: [{ op: 'addC', kind: 'loyalty', n: 1, who: 'self' }] } }] : null; } }
  t = t.replace(/exile the top card of your library\. you may cast (?:that card|it)( without paying its mana cost)?\. if you don't, ([^.]+)/, (_, f: string, e: string) => `§exilecast ${f ? 'free' : ''}|${e}`)
    .replace(/exile the top card of your library face down and look at it\. create ([^.]+?)\. when that token leaves the battlefield, put the exiled card into your hand/, '§uginx $1')
    .replace(/search your library for any number of ([a-z ]+?) cards, exile them, then shuffle\. until end of turn, you may cast those cards without paying their mana costs/, '§searchexilefree $1')
    .replace(/for each player, choose an? ([a-z]+) that player controls\. each player sacrifices all \1s they control not chosen this way/, '§keepone $1')
    .replace(/(sacrifice (?:a|an|another) [a-z ]+)\. if you do, /g, '$1 §ifdid ')
    .replace(/( until your next turn| until end of turn)?\. (?:it's|it is) still an? (land|artifact)(?=\.|$)/g, " that's still a $2$1");
  // multi-sentence templates
  const look = /^(.*?)look at the top (\w+) cards of your library\. (?:you may )?(?:reveal|put|choose) (a|an|one|two|up to (?:one|two|three)|any number of) (.+?) (?:cards? )?from among (?:them|those cards)(?: and put (?:it|them|that card|those cards) (into your hand|onto the battlefield( tapped)?))?(?: into your hand)?\. put the rest (on the bottom of your library(?: in (?:a|any) random order| in any order)?|into your graveyard)(.*)$/.exec(t)
    ?? /^(.*?)look at the top (\w+) cards of your library\. put (one|two) of them into your hand and the (?:rest|other) (on the bottom of your library(?: in (?:a|any) random order| in any order)?|into your graveyard)(.*)$/.exec(t);
  if (look) {
    const simple = look.length === 6;
    const pre = look[1] ? effects(look[1], cx) : []; if (!pre) return null;
    const n = num(look[2]); const takeW = simple ? look[3] : look[3]; const take = takeW === 'any number of' ? 99 : num(takeW.replace('up to ', ''));
    const noun = simple ? 'card' : look[4]; const fp = noun === 'card' ? { f: {} } : parseFilter(noun + ' card'); if (n === null || take === null || !fp) return null;
    const dest = !simple && look[5] === 'onto the battlefield' ? 'battlefield' : 'hand';
    const rest = (simple ? look[4] : look[7]).startsWith('into') ? 'graveyard' : 'bottom';
    const post = (simple ? look[5] : look[8]).replace(/^\.\s*/, ''); const tail = post ? effects(post, cx) : []; if (!tail) return null;
    return [...pre, { op: 'look', n, take, f: fp.f, dest, tapped: !simple && !!look[6], rest, text: noun }, ...tail];
  }
  const imp = /^(.*?)exile the top (card|\w+ cards) of your library\. (?:until (?:the )?end of (?:your next )?turn, )?you may play (?:it|that card|them|those cards)(?: this turn| until the end of your next turn| until end of turn)?(.*)$/.exec(t);
  if (imp) { const pre = imp[1] ? effects(imp[1], cx) : []; const k = imp[2] === 'card' ? 1 : num(imp[2].split(' ')[0]); const post = imp[3].replace(/^\.\s*/, ''); const tail = post ? effects(post, cx) : []; if (!pre || !tail || k === null) return null; return [...pre, { op: 'exileTop', n: k, until: /next turn/.test(imp[0]) ? 'yourNext' : 'eot' }, ...tail]; }
  t = t.replace(/(you|target opponent|target player|each opponent) gets? an emblem with "([^"]+)"/g, (_, w: string, b: string) => { EMB.push(b.replace(/\.$/, '')); return `${w} gets emblem#${EMB.length - 1}${/\.$/.test(b) ? '.' : ''}`; })
    .replace(/that's still a planeswalker\. prevent all damage that would be dealt to (?:him|her|it|them) this turn/, "that's still a planeswalker §prevent");
  t = t.replace(/(that player|they) may pay \{(\d+)\}\. if (?:the player|they|that player) (?:doesn't|don't|does not|do not), ([^.]+)/g, '$3 unless $1 pays {$2}')
    .replace(/(you may [^.]+)\. if you do, /g, '$1 §ifdo ')
    .replace(/\. you gain life equal to the life lost this way/, ' §gainlost')
    .replace(/look at the top card of (target player's|target opponent's) library\. you may put that card on the bottom of that player's library/, (_, p: string) => `§looktb ${p.replace(/'s$/, '')}`)
    .replace(/separate all permanents (target player|target opponent) controls into two piles\. /, 'separate all permanents $1 controls into two piles§ ')
    .replace(/look at the top card of your library\. if it's an? ([a-z ]+?) card( of the chosen type)?, you may reveal it and put it into your hand/, '§lookone $1$2')
    .replace(/^choose a creature type(?=\. .*(?:aren't|isn't) of the chosen type)/, 'choose a creature type §keep')
    .replace(/reveal the top (\w+) cards of your library\. put all ([a-z ]+?) cards (?:revealed this way|from among them) (into your hand|onto the battlefield(?: tapped)?) and the rest (on the bottom of your library(?: in any order| in a random order)?|into your graveyard|into your hand)/, '§revtop $1|$2|$3|$4')
    .replace(/reveal cards from the top of your library until you reveal an? ([a-z ]+?) card\. put (?:that|the revealed) card (into your hand|onto the battlefield) and the rest on the bottom of your library in a random order/, '§revuntil $1|$2');
  // sentences
  const sents = t.split(/\.\s+/); let lastStart = 0;
  for (let i = 0; i < sents.length; i++) {
    const s = sents[i];
    const rx = /^when you do, (.+)$/s.exec(s);
    if (rx && out.length) { // reflexive trigger: everything after "when you do" is its own ability with its own targets
      const rcx = newCx({ it: 'ev', that: 'ev', thatPl: 'ctl:ev' }); const body = [rx[1], ...sents.slice(i + 1)].join('. ');
      const rfx = effects(body, rcx); if (!rfx) return null; const prev = out.splice(lastStart);
      out.push({ op: 'reflex', sub: prev, rt: { label: 'when you do, ' + body, effects: rfx, tslots: rcx.slots.length ? rcx.slots : undefined } }); break; }
    lastStart = out.length;
    // flicker: "exile X. return it/that card to the battlefield under its owner's control [at the beginning of the next end step]"
    const ret = /^return (?:it|that card|that creature|them|those cards|the exiled card|the exiled cards) to the battlefield under (?:its owner's|their owners'|your) control( at the beginning of the next end step| at the beginning of (?:that player's|its owner's|their owner's) next end step)?$/.exec(s.replace(/\.$/, ''));
    if (ret && out.length && out[out.length - 1].op === 'exile') { const ex = out.pop()!; out.push({ op: 'flicker', who: ex.who, ret: !ret[1] ? 'now' : /next end step$/.test(ret[1]) && !/the next/.test(ret[1]) ? 'ownerEnd' : 'eot' }); continue; }
    if (/^(?:it|they) can't be regenerated$/.test(s)) continue;
    const ins = /^if (.+?), (.+) instead$/.exec(s.replace(/\.$/, ''));
    if (ins && out.length) { const c = cond(ins[1], cx); const sub = c && clause(ins[2], cx); if (!c || !sub) return null; const prev = out.pop()!; out.push({ op: 'if', cond: c, sub, else: [prev] }); continue; }
    const e = clause(s, cx); if (!e) return null;
    // "it"/"that creature" now refer to the first target, if any
    out.push(...e);
    const st = e.find(x => x.op === 'steal' && typeof x.who === 'object'); if (st) { cx.it = st.who as never; cx.that = st.who as never; }
    const firstT = e.find(x => typeof x.who === 'string' && /^t\d+$/.test(x.who as string)); if (firstT) { cx.it = firstT.who as string; cx.that = firstT.who as string; }
  }
  return out;
}

// ---------- abilities ----------
interface ParsedCost { ab: Partial<ActAbility> }
function parseCosts(s: string, name: string): ParsedCost | null {
  const ab: Partial<ActAbility> = {};
  const parts = s.split(/,\s*/);
  for (const p0 of parts) {
    const p = p0.trim(); let m: RegExpExecArray | null;
    if (/^\{t\}$/.test(p)) ab.tap = true;
    else if (/^\{q\}$/.test(p)) ab.untap = true;
    else if (/^(\{[^}]+\})+$/.test(p)) { const c = parseCost(p.toUpperCase()); if (!c) return null; ab.mana = c; if (c.x) ab.xFromMana = true; }
    else if (p === 'sacrifice ~') ab.sac = true;
    else if ((m = /^sacrifice (a|an|another|two|three|x|\w+) (.+)$/.exec(p))) { const n = m[1] === 'another' ? 1 : num(m[1]); const fp = parseFilter(m[2]); if (!fp || n === null || n === 'X') return null; ab.sacF = { f: fp.f, n, other: m[1] === 'another' || fp.f.other }; }
    else if (p === 'discard ~') ab.zone = 'hand';
    else if ((m = /^discard (a|an|one|two|three) cards?( at random)?$/.exec(p))) { ab.discard = num(m[1]) as number; ab.discardRandom = !!m[2]; }
    else if ((m = /^pay (\d+) life$/.exec(p))) ab.life = +m[1];
    else if ((m = /^remove (a|an|one|two|three|\d+) ([+-]\d\/[+-]\d|[a-z]+) counters? from ~$/.exec(p))) ab.remC = { kind: m[2], n: num(m[1]) as number };
    else if ((m = /^put (a|an|one|two) ([+-]\d\/[+-]\d|[a-z]+) counters? on ~$/.exec(p))) ab.addC = { kind: m[2], n: num(m[1]) as number };
    else if (p === 'exile ~ from your graveyard') { ab.zone = 'graveyard'; ab.exileGy = { n: 1, self: true }; }
    else if ((m = /^exile (a|an|one|two|three|\d+) (.*?) ?cards? from your graveyard$/.exec(p))) { const fp = m[2] ? parseFilter(m[2] + ' card') : { f: {} }; if (!fp) return null; ab.exileGy = { f: fp.f, n: num(m[1]) as number }; }
    else if ((m = /^tap (a|an|one|two|three|\d+) untapped (.+?) you control$/.exec(p))) { const fp = parseFilter(m[2]); if (!fp) return null; ab.tapF = { f: fp.f, n: num(m[1]) as number }; }
    else if (p === 'exile ~') ab.exileSelf = true;
    else if ((m = /^waterbend \{(\d+)\}$/.exec(p))) { ab.mana = { generic: +m[1] }; ab.wb = +m[1]; }
    else return null;
  }
  void name; return { ab };
}
function cleanLine(l: string): string { return l.replace(/^[a-z' ,-]+ — /, s => (/^(choose|when|whenever|at)\b/.test(s) ? s : '')); }

export interface CompileResult { unparsed: string[]; notes: string[]; ok: boolean }
export interface ScryLike { name: string; oracle_text?: string; type_line?: string; mana_cost?: string; power?: string; toughness?: string; loyalty?: string; keywords?: string[] }

export function normalize(text: string, name: string): string {
  let t = text.replace(/\([^)]*\)/g, '');
  const short = name.split(',')[0].split(' of ')[0];
  t = t.split(name).join('~');
  if (short.length > 3 && short !== name) t = t.replace(new RegExp(`\\b${short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), '~');
  t = t.toLowerCase().replace(/[−–]/g, '-').replace(/\b(this (creature|artifact|enchantment|land|permanent|spell|card|equipment|aura|vehicle|planeswalker|token|spacecraft|planet|class|saga|mount))\b/g, '~');
  t = t.replace(/ of (?:their|his or her|your) choice/g, '').replace(/enters the battlefield/g, 'enters').replace(/enters under your control/g, 'enters under your control').replace(/ +/g, ' ').replace(/ \./g, '.');
  return t;
}

function trigger(head: string): { defs: Partial<TriggerDef>[]; cx: Partial<Cx> } | null {
  let m: RegExpExecArray | null; const h = head.trim().replace(/ under your control$/, ' you control').replace(/^~ deal /, '~ deals ');
  if ((m = /^(an? |another |one or more )(.+?) enters or attacks$/.exec(h))) { const a = trigger(`${m[1]}${m[2]} enters`); const b = trigger(`${m[1]}${m[2]} attacks`); if (a && b) return { defs: [...a.defs, ...b.defs], cx: a.cx }; }
  const self = (ev: string, extra: Partial<TriggerDef> = {}) => ({ defs: [{ ev, subj: 'self' as const, ...extra }], cx: { it: 'self' } });
  if (/^~ enters$/.test(h)) return self('etb');
  if (/^~ enters or attacks$|^~ attacks or enters$/.test(h)) return { defs: [{ ev: 'etb', subj: 'self' }, { ev: 'attacks', subj: 'self' }], cx: { it: 'self' } };
  if (/^~ dies$|^~ is put into a graveyard from the battlefield$/.test(h)) return self('dies');
  if (/^~ enters or dies$/.test(h)) return { defs: [{ ev: 'etb', subj: 'self' }, { ev: 'dies', subj: 'self' }], cx: { it: 'self' } };
  if (/^~ leaves the battlefield$/.test(h)) return self('ltb');
  if (/^~ attacks$/.test(h)) return { ...self('attacks'), cx: { it: 'self', thatPl: 'def' } };
  if (/^~ blocks$/.test(h)) return self('blocks');
  if (/^~ attacks or blocks$/.test(h)) return { defs: [{ ev: 'attacks', subj: 'self' }, { ev: 'blocks', subj: 'self' }], cx: { it: 'self' } };
  if (/^~ becomes blocked$/.test(h)) return self('blocked');
  if (/^~ deals combat damage to a player$/.test(h)) return { ...self('combatDamagePlayer'), cx: { it: 'self', thatPl: 'evp' } };
  if (/^~ deals combat damage to an opponent$/.test(h)) return { defs: [{ ev: 'combatDamagePlayer', subj: 'self', pl: 'notyou' }], cx: { it: 'self', thatPl: 'evp' } };
  if (/^~ deals damage to (a player|an opponent)$/.test(h)) return { defs: [{ ev: 'damagePlayer', subj: 'self' }], cx: { it: 'self', thatPl: 'evp' } };
  if ((m = /^(equipped|enchanted) creature (dies|attacks|deals combat damage to a player|deals damage)$/.exec(h))) return { defs: [{ ev: m[2] === 'dies' ? 'dies' : m[2] === 'attacks' ? 'attacks' : m[2] === 'deals damage' ? 'damagePlayer' : 'combatDamagePlayer', subj: 'attached' }], cx: { it: 'attached', that: 'ev', thatPl: 'evp' } };
  if ((m = /^(?:(a|an|another|one or more|one or more other)|~ or (another|an?)) (.+?) (enters|dies|attacks|blocks|deals combat damage to a player|deals combat damage to an opponent|leaves the battlefield|is put into a graveyard from the battlefield|enter|die|attack)$/.exec(h))) {
    const fp = parseFilter(m[3]); if (!fp || fp.card || fp.spell) return null;
    const other = m[1] === 'another' || m[1] === 'one or more other'; if (other) fp.f.other = true;
    const ev = { enters: 'etb', enter: 'etb', dies: 'dies', die: 'dies', 'is put into a graveyard from the battlefield': 'dies', attacks: 'attacks', attack: 'attacks', blocks: 'blocks', 'deals combat damage to a player': 'combatDamagePlayer', 'deals combat damage to an opponent': 'combatDamagePlayer', 'leaves the battlefield': 'ltb' }[m[4]]!;
    return { defs: [{ ev, subj: other ? 'other' : 'any', f: fp.f }], cx: { it: 'ev', that: 'ev', thatPl: ev === 'combatDamagePlayer' ? 'evp' : 'ctl:ev' } };
  }
  if ((m = /^(a|an|one or more) (.+?) attacks? you(?: or a planeswalker you control)?$/.exec(h))) { const fp = parseFilter(m[2]); return fp ? { defs: [{ ev: 'attacks', subj: 'any', f: fp.f, pl: 'you' }], cx: { it: 'ev', that: 'ev', thatPl: 'ctl:ev' } } : null; }
  if ((m = /^(you|an opponent|a player|target opponent) casts? (?:an|a|your first)\b ?(.*?) ?spell(?: this turn)?$/.exec(h.replace(/ spell of the chosen type$/, ' of the chosen type spell').replace(/^(.+?) spell (with mana value \d+ or (?:greater|less))$/, '$1 $2 spell')))) { if (/first/.test(h)) return null; const fp = m[2] ? parseFilter(/ with /.test(m[2]) ? m[2].replace(' with ', ' spell with ') : m[2] + ' spell') : { f: {} }; if (!fp) return null; return { defs: [{ ev: 'cast', subj: 'any', f: fp.f, pl: m[1] === 'you' ? 'you' : m[1] === 'a player' ? 'any' : 'notyou' }], cx: { it: 'ev', that: 'ev', thatPl: 'evp' } }; }
  if ((m = /^your commander (enters or attacks|enters|attacks|deals combat damage to a player|dies)$/.exec(h))) { const r = trigger(`a commander creature you own ${m[1]}`); if (r) for (const d0 of r.defs) if (d0.ev === 'attacks' || d0.ev === 'combatDamagePlayer') d0.f = { ...d0.f, ctrl: 'you' }; return r; }
  if (/^you attack with your commander$/.test(h)) { const r = trigger('a commander creature you own attacks'); if (r) for (const d0 of r.defs) d0.f = { ...d0.f, ctrl: 'you' }; return r; }
  if (/^you cast ~$/.test(h)) return { defs: [{ ev: 'castSelf', subj: 'self' }], cx: { it: 'self' } };
  if ((m = /^(you|an opponent) casts? (?:your|their) (first|second|third|fourth) ?(noncreature|instant, sorcery, or villain|) spell each turn$/.exec(h))) { const k = m[3] === '' ? 'n' : m[3] === 'noncreature' ? 'nonc' : 'isv'; const f: Filter = m[3] === 'noncreature' ? { notTypes: ['Creature'] } : m[3] ? { anyType: ['Instant', 'Sorcery', 'Villain'] } : {}; return { defs: [{ ev: 'cast', subj: 'any', f, pl: m[1] === 'you' ? 'you' : 'notyou', nth: { k, n: ORD[m[2]] } }], cx: { it: 'ev', that: 'ev', thatPl: 'evp' } } as never; }
  if ((m = /^(you|an opponent) draws? (?:your|their) (first|second|third) card each turn$/.exec(h))) return { defs: [{ ev: 'drawCard', pl: m[1] === 'you' ? 'you' : 'notyou', nth: { k: 'draw', n: ORD[m[2]] } }], cx: { it: 'self', thatPl: 'evp' } } as never;
  if ((m = /^an? ([a-z ]+?) (?:is|are) put into your graveyard from the battlefield$/.exec(h))) { const fp = parseFilter(m[1]); return fp && !fp.card ? { defs: [{ ev: 'dies', subj: 'any', f: { ...fp.f, ctrl: 'you' } }], cx: { it: 'ev', that: 'ev' } } : null; }
  if (/^you cast your commander$/.test(h)) return { defs: [{ ev: 'cast', subj: 'any', pl: 'you', filter: 'commander' }], cx: { it: 'ev' } };
  if (/^the beginning of combat on your turn$/.test(h)) return { defs: [{ ev: 'beginCombat', pl: 'you' }], cx: { it: 'self', thatPl: 'evp' } };
  if ((m = /^the beginning of (your|each|each opponent's|each player's|the) (upkeep|end step|draw step|combat on your turn|combat)$/.exec(h))) {
    const ev = { upkeep: 'upkeep', 'end step': 'endStep', 'draw step': 'drawStep', 'combat on your turn': 'beginCombat', combat: 'beginCombat' }[m[2]]!;
    const p = m[1] === 'your' || m[2] === 'combat on your turn' ? 'you' : m[1] === "each opponent's" ? 'notyou' : 'any';
    return { defs: [{ ev, pl: p as TriggerDef['pl'] }], cx: { it: 'self', thatPl: 'evp' } };
  }
  if (/^you gain life$/.test(h)) return { defs: [{ ev: 'gainLife', pl: 'you' }], cx: { it: 'self' } };
  if (/^you lose life$/.test(h)) return { defs: [{ ev: 'loseLife', pl: 'you' }], cx: { it: 'self' } };
  if (/^an opponent loses life$/.test(h)) return { defs: [{ ev: 'loseLife', pl: 'notyou' }], cx: { it: 'self', thatPl: 'evp' } };
  if (/^you draw a card$/.test(h)) return { defs: [{ ev: 'drawCard', pl: 'you' }], cx: { it: 'self' } };
  if (/^a player draws a card$/.test(h)) return { defs: [{ ev: 'drawCard', pl: 'any' }], cx: { it: 'self', thatPl: 'evp' } };
  if (/^an opponent draws a card$/.test(h)) return { defs: [{ ev: 'drawCard', pl: 'notyou' }], cx: { it: 'self', thatPl: 'evp' } };
  if (/^you discard a card$/.test(h)) return { defs: [{ ev: 'discard', pl: 'you' }], cx: { it: 'self' } };
  if (/^one or more creatures you control deal combat damage to a player$/.test(h)) return { defs: [{ ev: 'combatBatch', pl: 'you' }], cx: { it: 'self' } };
  if (/^you attack$|^you attack with one or more creatures$/.test(h)) return { defs: [{ ev: 'youAttack', pl: 'you' }], cx: { it: 'self' } };
  if ((m = /^you sacrifice (a|an|another|one or more) (.+)$/.exec(h))) { const fp = parseFilter(m[2]); if (!fp) return null; if (m[1] === 'another') fp.f.other = true; return { defs: [{ ev: 'sacrificed', subj: 'any', f: fp.f, pl: 'you' }], cx: { it: 'ev', that: 'ev' } }; }
  { const ch = /^§chapter ([\d+]+)$/.exec(h); if (ch) return { defs: ch[1].split('+').map(n => ({ ev: 'chapter', subj: 'self', ifc: { k: 'evAmt', n: +n } })), cx: {} } as never; }
  { const lv = /^~ becomes level (\d+)$/.exec(h); if (lv) return { defs: [{ ev: 'classLevel', subj: 'self', ifc: { k: 'evAmt', n: +lv[1] } }], cx: {} } as never; }
  if (/^~ becomes saddled for the first time each turn$/.test(h)) return { defs: [{ ev: 'saddled', subj: 'self' }], cx: {} };
  if (/^~ becomes crewed$/.test(h)) return { defs: [{ ev: 'crewed', subj: 'self' }], cx: {} };
  if (/^you create (?:a|one or more) tokens?$/.test(h)) return { defs: [{ ev: 'tokenCreated', subj: 'any', pl: 'you' }], cx: { it: 'ev', that: 'ev' } };
  if ((m = /^(?:one or more|a) \+1\/\+1 counters? (?:is|are) put on (~|a creature you control|another creature you control)$/.exec(h))) return { defs: [{ ev: 'counterPut', kindF: '+1/+1', subj: m[1] === '~' ? 'self' : m[1].startsWith('another') ? 'other' : 'any', f: { types: ['Creature'], ctrl: 'you' } }], cx: { it: m[1] === '~' ? 'self' : 'ev', that: 'ev' } };
  if ((m = /^a land enters you control$/.exec(h))) return { defs: [{ ev: 'etb', subj: 'any', f: { types: ['Land'], ctrl: 'you' } }], cx: { it: 'self', that: 'ev' } };
  return null;
}
const pl2: Record<string, TriggerDef['pl']> = { you: 'you', any: 'any', notyou: 'opp' };
const ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4 };

export function compile(sc: ScryLike, d: CardDef): CompileResult {
  const unparsed: string[] = []; const notes: string[] = []; CUR_NAME = sc.name;
  const text = normalize(sc.oracle_text ?? '', sc.name);
  const rawLines = text.split('\n').map(x => x.trim()).filter(Boolean);
  // join modal bullets
  const lines: string[] = [];
  for (const l of rawLines) { if (l.startsWith('•') && lines.length) lines[lines.length - 1] += '\n' + l; else lines.push(l); }
  const isSpell = d.types.includes('Instant') || d.types.includes('Sorcery');
  const kws = new Set(d.keywords ?? []); const manaLines: ManaAbility[] = [];
  const abilities: ActAbility[] = []; const triggers: TriggerDef[] = []; const statics: Static[] = [];
  let spellFx: Effect[] = []; let spellSlots: TSlot[] = []; let spellModes: Modes | undefined;
  const fail = (l: string) => unparsed.push(l);
  let cls = 0; let lvl: Cond | null = null;
  const ROM: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };
  for (const raw of lines) {
    let l = cleanLine(raw).replace(/\.$/, '');
    { const ch = d.sub?.includes('Saga') ? /^((?:i|ii|iii|iv|v|vi|vii)(?:, (?:i|ii|iii|iv|v|vi|vii))*) — (.+)$/s.exec(raw.replace(/\.$/, '')) : null;
      if (ch) { const ns = ch[1].split(', ').map(x => ROM[x]); d.saga = Math.max(d.saga ?? 0, ...ns); l = `when §chapter ${ns.join('+')}, ${ch[2]}`; } }
    { let x: RegExpExecArray | null;
      if ((x = /^mobilize (\d+)$/.exec(l))) l = `whenever ~ attacks, §mobilize ${x[1]}`;
      else if ((x = /^firebending (\w+(?:, where x is .+)?)$/.exec(l))) l = `whenever ~ attacks, §firebend ${x[1]}`;
      else if (/^job select$/.test(l)) l = 'when ~ enters, §jobselect';
      // The engine has no effects that copy spells, so "cast or copy" triggers only on casts (exact while that holds).
      l = l.replace(/^whenever you cast or copy /, 'whenever you cast ').replace(/^void — /, '').replace(/^whenever ~ attacks while saddled, /, 'whenever ~ attacks, if ~ is saddled, ');
      if (/^increment$/.test(l)) l = 'whenever you cast a spell, if §incr, put a +1/+1 counter on ~';
      { const cl = /^(\{[^:]+\}): level (\d+)$/.exec(l); if (cl && d.sub?.includes('Class')) { const c = parseCost(cl[1].toUpperCase()); if (!c) { fail(raw); continue; } cls = +cl[2]; abilities.push({ label: `Level ${cls}`, mana: c, sorcery: true, cond: { k: 'ctrEq', kind: 'class', n: cls - 1 }, effects: [{ op: 'classLevel', n: cls }] }); continue; } }
      { const lr = /^level (\d+)(?:-(\d+)|\+)$/.exec(l); if (lr) { lvl = { k: 'ctrIn', kind: 'level', n: +lr[1], max: lr[2] ? +lr[2] : 999 } as Cond; continue; } }
      if (lvl) { const pt = /^(\d+)\/(\d+)$/.exec(l); if (pt) { statics.push({ k: 'pt', who: 'self', p: +pt[1] - (d.power ?? 0), t: +pt[2] - (d.toughness ?? 0), cond: lvl }); continue; } }
      if (cls > 1 && !/^when ~ becomes level/.test(l)) l = `§cond ${l}`;
      if (lvl) l = `§lvl ${l}`;
      if (/^start your engines!?$/.test(l)) { d.engines = true; continue; }
      if (/^station$/.test(l)) { abilities.push({ label: 'Station', sorcery: true, station: true, effects: [{ op: 'addC', kind: 'charge', n: 'X', who: 'self' }] }); continue; }
      const cb = /^(\d+)\+ \| (.+)$/s.exec(l) ?? /^max speed — (.+)$/s.exec(l) ?? /^§cond (.+)$/s.exec(l) ?? /^§lvl (.+)$/s.exec(l);
      if (cb) {
        const thr = cb.length === 3 ? +cb[1] : 0; const body = cb.length === 3 ? cb[2] : cb[1];
        const cond: Cond = thr ? { k: 'ctrGE', kind: 'charge', n: thr } : l.startsWith('§cond') ? { k: 'ctrGE', kind: 'class', n: cls } : l.startsWith('§lvl') ? lvl! : { k: 'maxSpeed' };
        if (thr) d.stationAt = Math.max(d.stationAt ?? 0, thr);
        if (/^§/.test(body)) { fail(raw); continue; }
        const owner = CUR_NAME; const t: CardDef = { id: 'cb', name: d.name, types: d.types, sub: d.sub, cost: { generic: 0 }, colors: [], text: '' };
        const r = compile({ name: sc.name, oracle_text: body, type_line: sc.type_line }, t); CUR_NAME = owner;
        const bad = !r.ok || t.mana || t.spell || t.ward || t.kicker || t.etbTapped || t.statics?.some(s => s.cond) || t.triggers?.some(x => x.ifc) || t.abilities?.some(a => a.cond);
        if (bad) { fail(raw); continue; }
        if (t.keywords?.length) statics.push({ k: 'kw', who: 'self', kws: t.keywords, cond });
        for (const s of t.statics ?? []) statics.push({ ...s, cond });
        for (const x2 of t.triggers ?? []) triggers.push({ ...x2, ifc: cond });
        for (const a of t.abilities ?? []) abilities.push({ ...a, cond });
        continue;
      }
    }
    if (/^if you control a commander, you may cast ~ without paying its mana cost\.?$/.test(l) && !d.types.includes('Land')) { d.freeCmdr = true; continue; }
    // keyword line
    const kparts = l.split(/[,;] /);
    if (kparts.every(p => isKeyword(p.trim(), d, kws, abilities, sc))) continue;
    // modal
    let both: Cond | undefined;
    { const bi = /^choose one\. if (.+?), (?:you may )?choose both instead\.?\n(.*)$/s.exec(l); if (bi) { const c = cond(bi[1].replace(/ as you cast ~$/, ''), newCx()); if (!c) { fail(raw); continue; } both = c; l = `choose one —\n${bi[2]}`; } }
    const mm = /^choose (one|two|three|one or both|one or more|any number|up to (?:one|two|three)) —\n?(.*)$/s.exec(l);
    if (mm) {
      const cx = newCx({ spell: isSpell });
      const ms = parseModes(mm[1], mm[2], cx); if (!ms) { fail(raw); continue; }
      if (both) { if (ms.list.length !== 2) { fail(raw); continue; } ms.bothIf = both; }
      if (isSpell) { spellModes = ms; continue; }
      fail(raw); continue;
    }
    // planeswalker loyalty
    const lm = /^([+-]?\d+|[+-]x): (.+)$/.exec(l);
    if (lm && d.types.includes('Planeswalker')) {
      const cx = newCx(); const fx = effects(lm[2], cx); if (!fx) { fail(raw); continue; }
      abilities.push({ label: `${lm[1].startsWith('+') || lm[1] === '0' ? lm[1] : lm[1]}: ${shortLabel(lm[2])}`, loyalty: lm[1] === 'x' ? 0 : lm[1] === '-x' ? -0 : +lm[1], loyX: lm[1] === '-x' || undefined, effects: fx, tslots: cx.slots.length ? cx.slots : undefined, sorcery: true });
      continue;
    }
    { let x: RegExpExecArray | null;
      if ((x = /^whenever you tap an? ([a-z ]+?) for mana, add an additional \{([wubrgc])\}$/.exec(l))) { const fp = parseFilter(x[1]); if (fp) { statics.push({ k: 'manaExtra', who: 'all', f: { ...fp.f, ctrl: 'you' }, add: [x[2].toUpperCase()] }); continue; } }
      if (/^~ enters prepared$/.test(l)) { d.etbPrepared = true; continue; }
      if ((x = /^as long as ~ isn't on the battlefield, it's an? (\d+)\/(\d+) ([a-z]+) creature in addition to its other types$/.exec(l))) { const sb = SUB.get(x[3]) ?? x[3][0].toUpperCase() + x[3].slice(1); d.offBf = { addTypes: ['Creature'], addSub: [sb], p: +x[1], t: +x[2] }; continue; }
      if (/^as long as ~ is attached to a creature, ~ can't be attacked and has "whenever equipped creature deals combat damage during your turn, put that many loyalty counters on ~\.?"$/.test(l)) {
        statics.push({ k: 'cantBeAttacked', who: 'self', cond: { k: 'attachedCreature' } });
        triggers.push({ on: 'x', label: 'Whenever equipped creature deals combat damage during your turn, put that many loyalty counters on ~.', ev: 'combatDamage', subj: 'attached', ifc: { k: 'yourTurn' }, effects: [{ op: 'addC', kind: 'loyalty', n: 'ev', who: 'self' }] } as TriggerDef); continue; }
    }
    // triggered
    const tm = /^(when|whenever|at) (.+?), (.+)$/s.exec(l);
    if (tm && !isSpell) {
      let head = tm[2]; let body = tm[3];
      if (tm[1] === 'at') head = head.replace(/^the beginning of the end step$/, 'the beginning of each end step');
      let once = false;
      body = body.replace(/\. this ability triggers only once each turn$/, () => { once = true; return ''; });
      const tr = trigger(tm[1] === 'at' ? head : head);
      if (!tr) { fail(raw); continue; }
      const cx = newCx(tr.cx);
      let ifc: Cond | undefined;
      const im = /^if (.+?), (.+)$/s.exec(body);
      if (im) { const c = cond(im[1], cx); if (c) { ifc = c; body = im[2]; } }
      const md = /^choose (one|two|one or both|one or more|up to one) —\n?(.*)$/s.exec(body);
      let fx: Effect[] | null = null; let modes: Modes | undefined;
      if (md) { modes = parseModes(md[1], md[2], cx) ?? undefined; if (!modes) { fail(raw); continue; } fx = []; }
      else fx = effects(body, cx);
      if (!fx) { fail(raw); continue; }
      for (const t of tr.defs) triggers.push({ on: 'x', label: shortLabel(raw), effects: fx, tslots: cx.slots.length && !modes ? cx.slots : undefined, modes, ifc, once: once || undefined, ...t, pl: t.pl ? pl2[t.pl] ?? t.pl : undefined } as TriggerDef);
      continue;
    }
    // activated
    const am = /^([^:"]+): (.+)$/s.exec(l);
    if (am && !isSpell && /\{|sacrifice|discard|pay|remove|exile|tap|put/.test(am[1])) {
      const pc = parseCosts(am[1], sc.name); if (!pc) { fail(raw); continue; }
      let body = am[2]; const ab: ActAbility = { label: shortLabel(raw), effects: [], ...pc.ab } as ActAbility;
      body = body.replace(/\. activate (?:this ability )?only as a sorcery$/, () => { ab.sorcery = true; return ''; })
        .replace(/\. activate (?:this ability )?only once each turn$/, () => { ab.once = true; return ''; })
        .replace(/\. activate (?:this ability )?only during your turn$/, () => { ab.cond = { k: 'yourTurn' }; return ''; })
        .replace(/\. activate (?:this ability )?only if (.+)$/, (_, c) => { const cc = cond(c, newCx()); if (!cc) return '§FAIL'; ab.cond = cc; return ''; });
      if (body.includes('§FAIL')) { fail(raw); continue; }
      // mana abilities
      let only: string | undefined;
      body = body.replace(/\. (?:spend this mana only to (.+)|this mana can't be spent to cast (?:a )?nonartifact spells?)$/, (_, w?: string) => { only = !w ? 'artifact' : ({ 'cast a creature spell of the chosen type': 'ctypeSpell', 'cast a creature spell of the chosen type or activate an ability of a creature source of the chosen type': 'ctypeAny', 'cast a hero spell or to activate an ability of a hero source': 'hero', 'cast a villain spell or to activate an ability of a villain source': 'villain', 'cast a legendary spell': 'legendary', 'cast artifact spells or activate abilities of artifacts': undefined } as Record<string, string | undefined>)[w] ?? '§'; return ''; });
      if (only === '§') { fail(raw); continue; }
      if (only) { const r = /^add (.+)$/.exec(body) && manaAdd(body.slice(4), newCx()); if (!r || !ab.tap || Object.keys(pc.ab).length !== 1) { fail(raw); continue; } manaLines.push({ add: r.mana, n: r.n, only }); continue; }
      const pm = /^add (.+?)\. ~ deals (\d) damage to you$/.exec(body);
      if (pm && ab.tap && Object.keys(pc.ab).length === 1) { const r = manaAdd(pm[1], newCx()); if (r) { manaLines.push({ add: r.mana, n: r.n, pain: +pm[2] }); continue; } }
      const madd = /^add (.+)$/.exec(body);
      if (madd) {
        const r = manaAdd(madd[1], newCx()); if (!r) { fail(raw); continue; }
        if (ab.tap && Object.keys(pc.ab).length === 1 && !ab.cond) { manaLines.push({ add: r.mana, n: r.n }); continue; }
        if (ab.tap && pc.ab.sac && Object.keys(pc.ab).length === 2 && !r.n && r.mana.length === 1) { manaLines.push({ add: r.mana, sac: true }); continue; }
        ab.manaAb = true; ab.effects = [{ op: 'addMana', mana: r.mana as string[], n: r.n ?? 1 }]; abilities.push(ab); continue;
      }
      const cx = newCx();
      const md = /^choose (one|two|one or both) —\n?(.*)$/s.exec(body);
      if (md) { const ms = parseModes(md[1], md[2], cx); if (!ms) { fail(raw); continue; } ab.modes = ms; abilities.push(ab); continue; }
      const fx = effects(body, cx); if (!fx) { fail(raw); continue; }
      ab.effects = fx; if (cx.slots.length) ab.tslots = cx.slots;
      abilities.push(ab); continue;
    }
    // spell text
    if (isSpell && /^(~|this spell) (can't be countered|costs)|^as an additional cost/.test(l) && staticLine(l, d, statics, kws)) continue;
    if (isSpell) {
      const cx = newCx({ spell: true });
      const fx = effects(l, { ...cx, slots: spellSlots, it: spellSlots.length ? 't0' : 'self' });
      if (!fx) { fail(raw); continue; }
      spellFx.push(...fx); continue;
    }
    // statics
    if (staticLine(l, d, statics, kws)) continue;
    fail(raw);
  }
  // merge mana lines
  if (manaLines.length) {
    if (manaLines.length === 1) d.mana = [manaLines[0]];
    else if (manaLines.every(m => m.add.length === 1 && !m.n && !m.sac && !m.only)) { const pain = Math.max(0, ...manaLines.map(m => m.pain ?? 0)); d.mana = [{ add: [[...new Set(manaLines.flatMap(m => m.add[0].split('|')))].join('|') as ManaSym], pain: pain || undefined }]; if (pain) notes.push('pain: damage is dealt whenever it is tapped for mana, even for {C}'); }
    else { d.mana = [manaLines[0]]; unparsed.push('additional mana abilities'); }
  }
  if (abilities.length) d.abilities = [...(d.abilities ?? []), ...abilities];
  if (triggers.length) d.triggers = triggers;
  if (statics.length) d.statics = statics;
  if (spellFx.length || spellModes) d.spell = { effects: spellFx, tslots: spellSlots.length ? spellSlots : undefined, modes: spellModes };
  if (kws.size) d.keywords = [...kws];
  if (d.aura) { const bad = statics.some(s => s.who === 'attached' && ((s.k === 'pt' && typeof s.t === 'number' && s.t < 0) || s.k === 'cantBlock' || s.k === 'cantAttack')); d.aura.harm = bad; if (!bad && d.aura.f && !d.aura.f.ctrl) d.aura = { ...d.aura }; }
  if (isSpell && !d.spell && unparsed.length === 0 && text.trim()) unparsed.push('(no effect)');
  d.compiled = true;
  return { unparsed, notes, ok: unparsed.length === 0 };
}
let CUR_NAME = '';
/** Make normalized text readable: card name back in, sentences capitalized. */
export function pretty(s: string, name = CUR_NAME): string { const short = name.split(',')[0]; return s.replace(/~/g, short || 'this').replace(/(^|[.!?]\s+|\n•?\s*|: |— )([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/\b(i|ii|iii|iv)\b(?= —)/g, m => m.toUpperCase()); }
function shortLabel(s: string) { const t = pretty(s.replace(/\([^)]*\)/g, '').trim()); return t.length > 90 ? t.slice(0, 87) + '…' : t; }
function parseModes(head: string, rest: string, cx: Cx): Modes | null {
  const items = rest.split('\n').map(x => x.replace(/^•\s*/, '').trim()).filter(Boolean); if (items.length < 2) return null;
  const range: Record<string, [number, number]> = { one: [1, 1], two: [2, 2], three: [3, 3], 'one or both': [1, 2], 'one or more': [1, items.length], 'any number': [0, items.length], 'up to one': [0, 1], 'up to two': [0, 2], 'up to three': [0, 3] };
  const [min, max] = range[head] ?? [1, 1];
  const list: Modes['list'] = [];
  for (const it of items) {
    const before = cx.slots.length; const local = { ...cx, it: 'self' as Ref }; const fx = effects(it.replace(/^[a-z ]+ — /, ''), local); if (!fx) return null;
    list.push({ label: it.length > 80 ? it.slice(0, 77) + '…' : it, effects: fx, tslots: cx.slots.slice(before) });
  }
  return { min, max, list };
}
function isKeyword(p: string, d: CardDef, kws: Set<string>, abilities: ActAbility[], sc: ScryLike): boolean {
  let m: RegExpExecArray | null;
  if (KWS.includes(p)) { kws.add(p); return true; }
  if ((m = /^protection from (white|blue|black|red|green)(?: and from (white|blue|black|red|green))?$/.exec(p))) { kws.add('protection from ' + m[1]); if (m[2]) kws.add('protection from ' + m[2]); return true; }
  if ((m = /^ward (\{\d+\})$/.exec(p))) { d.ward = parseCost(m[1])!.generic; return true; }
  if ((m = /^equip(?: (.+?))? (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) {
    const c = parseCost(m[2].toUpperCase()); if (!c) return false; let f: Filter = { types: ['Creature'], ctrl: 'you' };
    if (m[1] === 'commander') f = { types: ['Creature'], ctrl: 'you', cmdr: 'any' };
    else if (m[1]) { const fp = parseFilter(m[1]); if (!fp) return false; f = { ...fp.f, types: [...(fp.f.types ?? []), 'Creature'], ctrl: 'you' }; }
    abilities.push({ label: `Equip ${m[2].toUpperCase()}`, mana: c, sorcery: true, equip: true, tslots: [{ who: 'perm', f, harm: false }], effects: [{ op: 'attach', who: 'self', other: 't0' }] }); return true;
  }
  if ((m = /^warp (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.warp = c; return true; }
  { const ak = /^(evoke|mayhem|harmonize|web-slinging) (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p); if (ak && !d.types.includes('Land')) { const c = parseCost(ak[2].toUpperCase()); if (!c) return false; if (ak[1] === 'evoke') { if (!d.types.includes('Creature')) return false; d.evoke = c; } else if (ak[1] === 'mayhem') d.mayhem = c; else if (ak[1] === 'harmonize') d.harmonize = c; else d.webSling = c; return true; } }
  if ((m = /^foretell (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p)) && !d.types.includes('Land')) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.foretell = c; return true; }
  if ((m = /^sneak (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p)) && !d.types.includes('Land')) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.sneak = c; return true; }
  if ((m = /^teamwork (\d+)$/.exec(p))) { d.teamwork = +m[1]; return true; }
  if (p === 'storied') { d.storied = true; return true; }
  if ((m = /^level up (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; abilities.push({ label: 'Level up', mana: c, sorcery: true, effects: [{ op: 'addC', kind: 'level', n: 1, who: 'self' }] }); return true; }
  if ((m = /^saddle (\d+)$/.exec(p))) { abilities.push({ label: `Saddle ${m[1]}`, crew: +m[1], sorcery: true, effects: [{ op: 'saddled' }] }); return true; }
  if ((m = /^crew (\d+)$/.exec(p))) { abilities.push({ label: `Crew ${m[1]}`, crew: +m[1], effects: [{ op: 'becomes', who: 'self', ce: { addTypes: ['Creature'] }, until: 'eot' }, { op: 'crewed' }] }); return true; }
  if ((m = /^kicker (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.kicker = c; return true; }
  if ((m = /^flashback (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.flashback = c; return true; }
  if ((m = /^(?:(basic land|plains|island|swamp|mountain|forest|land)?)cycling (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p.replace(/^(basic land|plains|island|swamp|mountain|forest)\s?cycling/, '$1cycling')))) {
    const c = parseCost(m[2].toUpperCase()); if (!c) return false;
    const fx: Effect[] = !m[1] ? [{ op: 'draw', n: 1, pl: 'you' }] : [{ op: 'search', n: 1, f: m[1] === 'basic land' ? { types: ['Land'], basic: true } : m[1] === 'land' ? { types: ['Land'] } : { types: [SUB.get(m[1])!] }, dest: 'hand', text: `${m[1]} card` }];
    abilities.push({ label: `${m[1] ? m[1][0].toUpperCase() + m[1].slice(1) : ''}${m[1] ? 'cycling' : 'Cycling'} ${m[2].toUpperCase()}`, mana: c, zone: 'hand', effects: fx }); return true;
  }
  if (p === 'convoke') { d.convoke = true; return true; }
  if (p === 'rebound' && (d.types.includes('Instant') || d.types.includes('Sorcery'))) { d.rebound = true; return true; }
  if ((m = /^enchant (.+)$/.exec(p))) { const fp = parseFilter(m[1]); if (!fp) return false; d.aura = { who: 'perm', f: fp.f }; return true; }
  if (/^(partner|partner with .+|friends forever|choose a background|doctor's companion)$/.test(p)) { d.partner = true; return true; }
  if (p === '~ can be your commander') { d.canBeCommander = true; return true; }
  void sc; return false;
}
function staticLine(l: string, d: CardDef, statics: Static[], kws: Set<string>): boolean {
  let m: RegExpExecArray | null; let c: Cond | undefined; let s = l;
  const cm = /^(.+?) as long as (.+)$/.exec(s) ?? /^as long as (.+?), (.+)$/.exec(s);
  if (cm) { const [body, cs] = s.startsWith('as long as') ? [cm[2], cm[1]] : [cm[1], cm[2]]; const cc = cond(cs, newCx()); if (!cc) return false; c = cc; s = body; }
  const dm = /^during your turn, (.+)$/.exec(s); if (dm) { c = { k: 'yourTurn' }; s = dm[1]; }
  { const um = /^(~ can't attack or block|~ can't attack|~ can't block) unless (.+)$/.exec(s); if (um && !c) { const cc = cond(um[2], newCx()); if (!cc) return false; const nc: Cond = { k: 'not', c: cc } as Cond; const ks: Static['k'][] = um[1].endsWith('attack or block') ? ['cantAttack', 'cantBlock'] : um[1].endsWith('attack') ? ['cantAttack'] : ['cantBlock']; for (const k of ks) statics.push({ k, who: 'self', cond: nc }); return true; } }
  if (/^~ enters tapped$/.test(s) && !c) { d.etbTapped = true; return true; }
  if ((m = /^as ~ enters, you may pay (\d) life\. if you don't, it enters tapped$/.exec(s))) { d.shock = +m[1]; return true; }
  if ((m = /^as ~ enters, you may reveal an? (\w+) or (\w+) card from your hand\. if you don't, ~ enters tapped$/.exec(s)) && typeWord(m[1]) && typeWord(m[2])) { d.etbTappedUnless = { k: 'handHas', f: { anyType: [typeWord(m[1])!, typeWord(m[2])!] } }; return true; }
  if (/^as ~ enters, choose a creature type$/.test(s) && !c) { d.chooseType = true; return true; }
  if (/^~ is the chosen type in addition to its other types$/.test(s) && !c) { d.addChosen = true; return true; }
  if ((m = /^(each other |other )?(.+?) enters? with an additional ([+-]\d\/[+-]\d|[a-z]+) counter on (?:it|them)$/.exec(s)) && !c) { const fp = parseFilter(m[2]); if (!fp || fp.card || fp.spell) return false; statics.push({ k: 'etbExtra', who: 'all', f: { ...fp.f, other: m[1] ? true : undefined }, kws: [m[3]], n: 1 }); return true; }
  if ((m = /^~ enters tapped unless (.+)$/.exec(s))) { const t = m[1].replace(/^you have two or more opponents$/, '§opp'); const cc: Cond | null = t === '§opp' ? { k: 'oppsGE', n: 2 } : cond(t, newCx()); if (!cc) return false; d.etbTappedUnless = cc; return true; }
  if ((m = /^as an additional cost to cast (?:this spell|~), (sacrifice|discard|pay) (an|a|one|two|\d+) (.*?)$/.exec(s))) {
    const n0 = num(m[2]); if (typeof n0 !== "number") return false; const n = n0;
    if (m[1] === 'pay' && /^life$/.test(m[3])) { d.extraCost = { life: +m[2] }; return true; }
    if (m[1] === 'discard' && /^cards?$/.test(m[3])) { d.extraCost = { discard: n }; return true; }
    if (m[1] === 'sacrifice') { const fp = parseFilter(m[3]); if (!fp || fp.card) return false; d.extraCost = { sacF: { f: fp.f, n } }; return true; }
    return false;
  }
  s = s.replace(/^(.*?)spells you cast of the chosen type cost/, '$1of the chosen type spells you cast cost');
  if ((m = /^(?:this spell|~) costs \{(\d)\} less to cast for each (.+)$/.exec(s))) { const a = forEach(m[2], newCx()); if (a === null) return false; d.selfCostLess = { n: +m[1], per: a }; return true; }
  if ((m = /^(~|enchanted creature|enchanted permanent|enchanted land|enchanted artifact|equipped creature) doesn't untap during (?:its controller's|your) untap step$/.exec(s))) { statics.push({ k: 'doesntUntap', who: m[1] === '~' ? 'self' : 'attached', cond: c }); return true; }
  if ((m = /^~ can't be blocked by (.+)$/.exec(s))) { const fp = parseFilter(m[1].replace(/^creatures/, 'creature')); if (!fp) return false; statics.push({ k: 'cantBeBlockedBy', who: 'self', spellF: fp.f, cond: c }); return true; }
  if ((m = /^~ enters with (a|an|one|two|three|four|five|six|x|\d+) ([+-]\d\/[+-]\d|[a-z]+) counters? on it$/.exec(s))) { d.etbCounters = { kind: m[2], n: num(m[1])! }; return true; }
  if ((m = /^~ enters with a number of \+1\/\+1 counters on it equal to (.+)$/.exec(s))) { const a = amount(m[1], newCx()); if (a === null) return false; d.etbCounters = { kind: '+1/+1', n: a }; return true; }
  if (/^(this spell|~) can't be countered$/.test(s)) { d.uncounterable = true; return true; }
  const PST: [RegExp, Static['k'], Static['who']][] = [
    [/^each opponent can't draw more than one card each turn$/, 'drawLimit', 'self'],
    [/^no more than one creature can attack ~ each combat$/, 'atkLimit1', 'self'],
    [/^each opponent can cast spells only any time they could cast a sorcery$/, 'oppsSorcery', 'self'],
    [/^spells and abilities your opponents control can't cause their controller to search their library$/, 'noSearch', 'self'],
    [/^if you would draw a card while your library has no cards in it, you win the game instead$/, 'winOnEmptyDraw', 'self'],
    [/^if one or more tokens would be created under your control, twice that many of those tokens are created instead$/, 'tokenDouble', 'self'],
    [/^you may activate (?:her|his|its|~'s) loyalty abilities any time you could cast an instant$|^you may activate loyalty abilities of ~ on any player's turn any time you could cast an instant$/, 'pwInstant', 'self'],
    [/^you may activate loyalty abilities of planeswalkers you control on any player's turn any time you could cast an instant$/, 'pwInstant', 'all'],
  ];
  for (const [re, k, who] of PST) if (re.test(s)) { statics.push({ k, who, cond: c }); return true; }
  if (/^you have (hexproof|shroud)$/.test(s) && !c) { statics.push({ k: 'playerHexproof', who: 'self', kws: [s.slice(9)] }); return true; }
  if (/^you have no maximum hand size$/.test(s)) { statics.push({ k: 'noMaxHand', who: 'self' }); return true; }
  if (/^you may play an additional land on each of your turns$/.test(s)) { statics.push({ k: 'noMaxHand', who: 'self', n: -1 }); return true; }
  if ((m = /^(.*?)spells (you cast|your opponents cast|cost) ?(?:cost )?\{(\d)\} (less|more) to cast$/.exec(s))) {
    const fp = m[1].trim() ? parseFilter(m[1].trim() + ' spell') : { f: {} }; if (!fp) return false;
    if (m[2] === 'your opponents cast' && m[4] === 'less') return false; if (m[2] === 'you cast' && m[4] === 'more') return false;
    statics.push({ k: m[4] === 'less' ? 'costLess' : 'costMore', who: 'all', n: +m[3], spellF: fp.f, cond: c }); return true;
  }
  if ((m = /^~'s power and toughness are each equal to (.+)$/.exec(s))) { const a = amount(m[1], newCx()); if (a === null) return false; statics.push({ k: 'pt', who: 'self', p: a, t: a }); return true; }
  if ((m = /^~'s power is equal to (.+)$/.exec(s))) { const a = amount(m[1], newCx()); if (a === null) return false; statics.push({ k: 'pt', who: 'self', p: a, t: 0 }); return true; }
  // subject + predicate
  const sm = /^(.+?) (gets?|get|has|have|can't block|can't attack or block|can't attack|can't be blocked|attacks each combat if able|attack each combat if able)(?: (.+))?$/.exec(s);
  if (!sm) return false;
  const subjS = sm[1]; let who: Static['who']; let f: Filter | undefined;
  if (subjS === '~') who = 'self'; else if (/^(enchanted|equipped) (creature|permanent|land|artifact)$/.test(subjS)) who = 'attached';
  else { const o = /^(other )?(.+)$/.exec(subjS)!; const fp = parseFilter(o[2]); if (!fp || fp.card || fp.spell || (!fp.plural && !/you control$|your opponents control$/.test(o[2]))) return false; who = o[1] ? 'others' : 'all'; f = fp.f; if (o[1]) f.other = true; }
  const pred = sm[2]; const rest = sm[3] ?? '';
  const out: Static[] = [];
  if (/^gets?$|^get$/.test(pred)) {
    const pm = /^([+-]\d+)\/([+-]\d+)(?: for each (.+?))?(?: and (?:has|have) (.+))?$/.exec(rest); if (!pm) return false;
    let p: Amt = +pm[1], t: Amt = +pm[2];
    if (pm[3]) { const fe = forEach(pm[3], newCx()); if (!fe) return false; p = p ? { mul: p as number, of: fe } : 0; t = t ? { mul: t as number, of: fe } : 0; }
    out.push({ k: 'pt', who, f, p, t, cond: c });
    if (pm[4]) { const k = kwList(pm[4]); if (k) out.push({ k: 'kw', who, f, kws: k, cond: c }); else if (/^can't block$/.test(pm[4])) return false; else return false; }
  } else if (/^has$|^have$/.test(pred)) { const k = kwList(rest); if (!k) return false; if (who === 'self' && !c) { k.forEach(x => kws.add(x)); return true; } out.push({ k: 'kw', who, f, kws: k, cond: c }); }
  else if (pred === "can't block") { if (rest) return false; out.push({ k: 'cantBlock', who, f, cond: c }); }
  else if (pred === "can't attack or block") { if (rest) return false; out.push({ k: 'cantBlock', who, f, cond: c }, { k: 'cantAttack', who, f, cond: c }); }
  else if (pred === "can't attack") { if (rest) return false; out.push({ k: 'cantAttack', who, f, cond: c }); }
  else if (pred === "can't be blocked") { if (rest) return false; out.push({ k: 'unblockable', who, f, cond: c }); }
  else if (/attacks? each combat if able/.test(pred)) { if (rest) return false; out.push({ k: 'mustAttack', who, f, cond: c }); }
  else return false;
  statics.push(...out); return true;
}
