/** Oracle-text ability compiler: turns Scryfall rules text into the engine's data-driven abilities.
 *  Every rules line either compiles into an exact engine representation or is reported as unparsed;
 *  callers use that to badge cards honestly ("Supported" vs "Limited"). */
import SUBTYPES from './subtypes.json';
import type { ActAbility, Amt, CardDef, CEFx, Color, Cond, Cost, Effect, Filter, ManaAbility, ManaSym, Modes, PRef, Ref, Replacement, Static, TokenSpec, TriggerDef, TSlot } from './types';

export const SUB = new Map<string, string>((SUBTYPES as string[]).map(s => [s.toLowerCase(), s]));
const TYPES: Record<string, string> = { creature: 'Creature', artifact: 'Artifact', enchantment: 'Enchantment', land: 'Land', planeswalker: 'Planeswalker', instant: 'Instant', sorcery: 'Sorcery', battle: 'Battle', permanent: 'Permanent', legendary: 'Legendary', historic: 'Historic', outlaw: 'Outlaw' };
const COLOR_OF: Record<string, Color> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
export const KWS = ['daybound', 'nightbound', 'phasing', 'compleated', 'wither', 'persist', 'myriad', 'flying', 'trample', 'haste', 'vigilance', 'lifelink', 'deathtouch', 'first strike', 'double strike', 'reach', 'menace', 'defender', 'flash', 'hexproof', 'prowess', 'melee', 'indestructible', 'shroud', 'protection from white', 'protection from blue', 'protection from black', 'protection from red', 'protection from green', 'changeling', 'devoid', 'fear', 'intimidate', 'shadow', 'horsemanship', 'plainswalk', 'islandwalk', 'swampwalk', 'mountainwalk', 'forestwalk', 'exalted', 'riot', 'protection from creatures', 'protection from multicolored'];
const IRREG: Record<string, string> = { elves: 'elf', dwarves: 'dwarf', wolves: 'wolf', werewolves: 'werewolf', fungi: 'fungus', mice: 'mouse', sorceries: 'sorcery', allies: 'ally', faeries: 'faerie', zombies: 'zombie', zombie: 'zombie', thieves: 'thief', leeches: 'leech', octopi: 'octopus', 'cyclopes': 'cyclops', 'sphinxes': 'sphinx', 'foxes': 'fox', 'boars': 'boar', 'mercenaries': 'mercenary', 'slivers': 'sliver' };
function typeWord(w: string | undefined): string | null {
  if (!w) return null;
  const cands = [IRREG[w], w, w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, '')].filter(Boolean) as string[];
  for (const c of cands) { if (TYPES[c]) return TYPES[c]; if (SUB.has(c)) return SUB.get(c)!; }
  return null;
}
const NUMW: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, another: 1 };
const N = '(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|x|\\d+)';
export function num(s: string | undefined): number | 'X' | null { if (!s) return null; if (s === 'x') return 'X'; if (/^\d+$/.test(s)) return +s; return NUMW[s] ?? null; }

// ---------- costs ----------
export function parseCost(mc = ''): Cost | null {
  const cost: Cost = { generic: 0 };
  for (const [, s0] of mc.matchAll(/\{([^}]+)\}/g)) {
    const s = s0.toUpperCase();
    if (/^\d+$/.test(s)) cost.generic += +s;
    else if (s === 'C') cost.C = (cost.C ?? 0) + 1;
    else if ('WUBRG'.includes(s) && s.length === 1) cost[s as Color] = (cost[s as Color] ?? 0) + 1;
    else if (s === 'X') cost.x = (cost.x ?? 0) + 1;
    else if (s === 'E') cost.E = (cost.E ?? 0) + 1;
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
    [/ defending player controls $/, () => (f.defP = true)],
    [/ with toughness (\d+) or greater $/, m => (f.touGE = +m[1])], [/ with toughness (\d+) or less $/, m => (f.touLE = +m[1])],
    [/ with power (\d+) or less $/, m => (f.powLE = +m[1])], [/ with power (\d+) or greater $/, m => (f.powGE = +m[1])],
    [/ with (?:mana value|converted mana cost) (\d+) or less $/, m => (f.mvLE = +m[1])], [/ with (?:mana value|converted mana cost) (\d+) or greater $/, m => (f.mvGE = +m[1])],
    [new RegExp(` with ${KW_RE} $`), m => (f.kw = m[1])], [new RegExp(` without ${KW_RE} $`), m => (f.noKw = m[1])],
    [/ that's attacking $| that's attacking you $/, () => (f.attacking = true)],
    [/ that attacked this turn $/, () => (f.attackedT = true)], [/ that's blocking $/, () => (f.blocking = true)],
    [/ blocking (?:it|~) $/, () => (f.blockingSrc = true)],
    [/ blocking or blocked by (?:it|~) $/, () => (f.blockRelSrc = true)],
    [/ of the chosen colou?r $/, () => (f.chosenColor = true)],
    [/ with (?:power )?(?:less than|lesser than) ~'s power $/, () => (f.powLTSrc = true)],
    [/ with lesser power $/, () => (f.powLTSrc = true)],
    [/ on the battlefield $/, () => {}],
    [/ that's one or more colors $/, () => (f.colored = true)],
    [/ with an? ([+-]\d\/[+-]\d|[a-z]+) counter on (?:it|them) $/, m => (f.ctr = m[1])],
    [/ with counters on (?:it|them) $/, () => (f.anyCtr = true)],
    [/ that was put there from the battlefield this turn $/, () => (f.fromBfT = true)],
    [/ with (?:mana value|converted mana cost) x or less $/, () => (f.mvLEX = true)], [/ with (?:mana value|converted mana cost) x $/, () => (f.mvEqX = true)],
    [/ with (?:mana value|converted mana cost) (\d+) $/, m => { f.mvLE = +m[1]; f.mvGE = +m[1]; }],
  ];
  for (let changed = true; changed;) { changed = false; for (const [re, fn] of SUF) { const m = re.exec(s); if (m) { fn(m); s = s.slice(0, m.index) + ' '; changed = true; } } }
  let w = s.trim().replace(/attacking or blocking/, 'atkblk').split(/\s+/).filter(Boolean);
  const notT: string[] = []; const cols: Color[] = []; const notC: Color[] = [];
  while (w.length > 1 || (w.length === 1 && /^(other|another)$/.test(w[0]))) {
    const x = w[0];
    if (x === 'other' || x === 'another') f.other = true;
    else if (x === 'each' || x === 'all') { /* quantifier */ }
    else if (x === 'tapped') f.tapped = true; else if (x === 'untapped') f.untapped = true;
    else if (x === 'attacking') f.attacking = true; else if (x === 'blocking') f.blocking = true; else if (x === 'atkblk') f.atkOrBlk = true;
    else if (x === 'legendary' && w.length > 1) f.legendary = true; else if (x === 'nonlegendary') f.nonlegendary = true;
    else if (x === 'basic') f.basic = true; else if (x === 'nonbasic') f.nonbasic = true;
    else if (x === 'nontoken') f.nontoken = true; else if (x === 'colorless') f.colorless = true; else if (x === 'multicolored') f.multicolor = true; else if (x === 'monocolored') f.monocolor = true;
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
  if (core && / and /.test(core)) { const ps = core.split(/,? and |, /); if (ps.length > 1 && ps.every(p => !!typeWord(p))) core = ps.join(', '); }
  if (core) {
    const parts = core.split(/,? or |, (?:and\/or )?| and\/or /).map(x => x.trim()).filter(Boolean);
    if (parts.length > 1) {
      const ts = parts.map(p => {
        const ws = p.split(' ').filter(Boolean);
        while (ws[0] === 'nonbasic' || ws[0] === 'basic' || ws[0] === 'legendary' || ws[0] === 'nonlegendary' || ws[0] === 'nontoken' || ws[0] === 'token') {
          const x = ws.shift()!;
          if (x === 'nonbasic') f.nonbasic = true; else if (x === 'basic') f.basic = true;
          else if (x === 'legendary') f.legendary = true; else if (x === 'nonlegendary') f.nonlegendary = true;
          else if (x === 'nontoken') f.nontoken = true; else if (x === 'token') f.token = true;
        }
        return ws.map(typeWord);
      });
      if (ts.some(row => !row.length || row.some(x => !x))) return null; if (ts.every(row => row.length === 1)) f.anyType = ts.map(row => row[0]!); else return null; if (parts.some(p => /s$/.test(p.split(' ').pop()!) && typeWord(p.split(' ').pop()!) !== p.split(' ').pop())) plural = true;
    }
    else { const ws = core.split(' '); const ts = ws.map(typeWord); if (ts.some(t => !t)) return null; f.types = [...(f.types ?? []), ...(ts as string[])]; if (/s$/.test(ws[ws.length - 1]) && !SUB.has(ws[ws.length - 1]) && !TYPES[ws[ws.length - 1]]) plural = true; }
  } else if (!card && !spell && !f.types && !f.token) return null;
  if (notT.length) f.notTypes = notT; if (cols.length) f.colors = cols; if (notC.length) f.notColors = notC;
  return { f, card, spell, plural };
}

// ---------- context ----------
export interface Cx { slots: TSlot[]; it?: Ref; that?: Ref; thatPl?: PRef; spell?: boolean; lastPl?: PRef; /** "that many" in this effect counts mana symbols of this color in the spell's mana cost */ pips?: Color; xAmt?: Amt }
export const newCx = (o: Partial<Cx> = {}): Cx => ({ slots: [], it: 'self', ...o });
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
  if (/^(up to (?:one|two|a) )?target activated ability, triggered ability, or noncreature spell$/.test(s)) return { ref: addSlot(cx, { who: 'stack', f: { notTypes: ['Creature'] }, harm: true, opt: s.startsWith('up to ') }) };
  if (/^target spell, activated ability, or triggered ability$/.test(s) || /^target spell or ability$/.test(s)) return { ref: addSlot(cx, { who: 'stack', harm: true }) };
  { const sp = /^target spell or nonland permanent( an opponent controls)?$/.exec(s); if (sp) return { ref: addSlot(cx, { who: 'spellOrPerm', f: { notTypes: ['Land'], ...(sp[1] ? { ctrl: 'opp' as const } : {}) }, harm: true }) }; }

  if (/^(one|two|three|\d+) target/.test(s) && !/^(one|two|three|\d+) target (creature|player|[a-z]+s\b)/.test(s)) return null;
  const tm = /^(?:(up to )?(one or two|one|two|three|four|five|x|\d+) )?(other |another )?target (.+)$/.exec(s);
  if (tm) {
    const oneOrTwo = tm[2] === 'one or two'; const isX = tm[2] === 'x';
    const n = isX ? 8 : tm[2] ? (oneOrTwo ? 2 : num(tm[2])) : 1; if (n === null || n === 'X') return null; const optAll = !!tm[1] || isX; let noun = tm[4];
    if (/^(creature or player|player or planeswalker|creature, player, or planeswalker|creature or planeswalker or player)$/.test(noun)) { const i = cx.slots.length; for (let k = 0; k < (n as number); k++) addSlot(cx, { who: 'any', harm, opt: optAll || (oneOrTwo && k > 0), ...((n as number) > 1 ? { grp: i } : {}) }); return { ref: (n as number) === 1 ? 't' + i : `tr:${i}-${i + (n as number) - 1}` }; }
    if (/^(player|players)$/.test(noun)) return { ref: addSlot(cx, { who: 'player', harm, opt: optAll }), pl: 't' + (cx.slots.length - 1) };
    if (/^(opponent|opponents)$/.test(noun)) return { ref: addSlot(cx, { who: 'opp', harm: true, opt: optAll }), pl: 't' + (cx.slots.length - 1) };
    if (/^(activated or triggered ability|activated ability|triggered ability)$/.test(noun)) return { ref: addSlot(cx, { who: 'ability', harm: true }) };
    let who: TSlot['who'] = 'perm'; let zoneOwner: TSlot['zoneOwner'];
    const gm = /^(.+?) (?:card|cards)( with [a-z0-9 ]+?)? (?:from|in) (your|a|an opponent's|target player's|that player's) graveyards?$/.exec(noun) ?? /^(card|cards)( with [a-z0-9 ]+?)? (?:from|in) (your|a|an opponent's) graveyards?$/.exec(noun);
    if (gm) { who = 'card'; zoneOwner = gm[3] === 'your' ? 'you' : gm[3] === 'a' ? 'any' : 'opp'; noun = (gm[1] === 'card' || gm[1] === 'cards' ? 'card' : gm[1] + ' card') + (gm[2] ?? ''); }
    const fp = parseFilter(noun); if (!fp) return null;
    if (fp.spell) who = 'spell'; else if (fp.card && who !== 'card') return null;
    if (tm[3]) fp.f.other = true;
    const i = cx.slots.length; for (let k = 0; k < (n as number); k++) addSlot(cx, { who, f: fp.f, harm: who === 'card' ? false : harm, opt: optAll || (oneOrTwo && k > 0), zoneOwner, ...(n as number > 1 ? { grp: i } : {}), ...(tm[3] && i > 0 ? { distinct: true } : {}), ...(isX ? { xIdx: k, xAmt: cx.xAmt } : {}) });
    return { ref: (n as number) === 1 ? 't' + i : `tr:${i}-${i + (n as number) - 1}`, card: who === 'card' };
  }
  const tp = /^(creatures?|permanents?) (target player|target opponent) controls$/.exec(s);
  if (tp) { const pl = addSlot(cx, { who: tp[2].includes('opponent') ? 'opp' : 'player', harm: false }); const i = cx.slots.length - 1; const fp = parseFilter(tp[1]); return fp ? { ref: { all: { ...fp.f, ctrlT: i } } } : null; }
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
  if ((m = /^the number of cards in (your|target player's|target opponent's|that player's|their) hand$/.exec(eq))) return { cards: 'hand', pl: playerRef(m[1], cx) ?? 'you' };
  if (/^the number of card types among cards in your graveyard$/.test(eq)) return { gyTypes: true };
  if (/^the number of card types among cards in all graveyards$/.test(eq)) return { gyTypesAll: true };
  if ((m = /^the number of (.+?) ?cards in your graveyard$/.exec(eq))) { const fp = m[1] ? parseFilter(m[1]) : { f: {} }; if (fp) return { cards: 'graveyard', pl: 'you', f: fp.f }; }
  if ((m = /^the number of (?:\+1\/\+1 )?counters on ~$/.exec(eq))) return { ctr: '+1/+1', who: 'self' };
  if ((m = /^the number of ([a-z]+) counters on ~$/.exec(eq))) return { ctr: m[1], who: 'self' };
  if (/^the number of opponents you have$/.test(eq)) return { opps: true };
  if (/^the number of opponents you attacked this turn$/.test(eq)) return { atkOpps: true };
  if (/^the number of differently named lands you control$/.test(eq)) return { uniqLands: true };
  if (/^the number of spells you've cast this turn$/.test(eq)) return { spells: true };
  if (/^the greatest mana value among commanders you control$/.test(eq)) return { mvMaxCmd: true };
  if (/^the number of colors of mana spent to cast (?:this spell|~)$/.test(eq)) return { spentCols: true };
  if (/^the number of colors among permanents you control$/.test(eq)) return { permColors: true };
  if (/^the greatest mana value among cards revealed this way$/.test(eq)) return 'revMaxMv' as Amt;
  if (/^your life total$/.test(eq)) return { life: 'you' };
  if ((m = /^the (?:greatest|highest) power among (.+)$/.exec(eq))) { const fp = parseFilter(m[1]); return fp && !fp.card ? { maxPow: fp.f } : null; }
  if (/^the life you've gained this turn$|^the amount of life you gained this turn$/.test(eq)) return { lifeGained: true };
  if (/^the total power of creatures you control$/.test(eq)) return { powSum: { types: ['Creature'], ctrl: 'you' } };
  if ((m = /^the number of (.+?) plus the number of (.+)$/.exec(eq))) {
    const a1 = amount('the number of ' + m[1], cx); const a2 = amount('the number of ' + m[2], cx);
    if (a1 !== null && a2 !== null) return { sum: [a1, a2] };
  }
  if ((m = /^the number of (.+?) cards in all graveyards$/.exec(eq))) { const fp = parseFilter(m[1] + ' cards'); if (fp) return { count: fp.f, zone: 'graveyard' as const }; }
  if (/^the number of basic land types among lands you control$/.test(eq)) return { domain: true };
  if (/^the number of card types among cards in your graveyard$/.test(eq)) return { gyTypes: true };
  if (/^the number of energy counters you have$/.test(eq) || /^the amount of \{e\} you have$/.test(eq) || /^the number of \{e\} you have$/.test(eq)) return { energy: true };
  if (/^the number of card types among cards in all graveyards$/.test(eq)) return { gyTypesAll: true };
  if ((m = /^(?:the )?(?:greatest|highest) mana value among (.+)$/.exec(eq))) { const fp = parseFilter(m[1]); return fp && !fp.card ? { maxMv: fp.f } : null; }
  if (/^the number of cards in the hand of the opponent with the most cards in hand$/.test(eq)) return { maxOppHand: true };
  if ((m = /^the number of (.+?)$/.exec(eq))) { const fp = parseFilter(m[1]); return fp && !fp.card && !fp.spell ? { count: fp.f } : null; }
  return null;
}
/** "for each X" → amount */
function forEach(s: string, cx: Cx): Amt | null {
  let m: RegExpExecArray | null;
  if (/^opponent you have$|^opponent$/.test(s)) return { opps: true };
  if (/^opponent you attacked this turn$/.test(s)) return { atkOpps: true };
  if (/^differently named land you control$/.test(s)) return { uniqLands: true };
  if (/^spell you've cast this turn$/.test(s)) return { spells: true };
  if (/^basic land type among lands you control$/.test(s)) return { domain: true };
  if ((m = /^card in (your|target player's|target opponent's|that player's) hand$/.exec(s))) return { cards: 'hand', pl: playerRef(m[1], cx) ?? 'you' };
  if ((m = /^(.*?) ?card in (their|that player's|target player's|target opponent's) graveyard$/.exec(s))) { const fp = m[1] ? parseFilter(m[1]) : { f: {} }; const p = m[2] === 'their' || m[2] === "that player's" ? cx.lastPl ?? cx.thatPl : playerRef(m[2], cx); return fp && p ? { cards: 'graveyard', pl: p, f: fp.f } : null; }
  if ((m = /^(.*?) ?card in your graveyard$/.exec(s))) { const fp = m[1] ? parseFilter(m[1]) : { f: {} }; return fp ? { cards: 'graveyard', pl: 'you', f: fp.f } : null; }
  if ((m = /^(\+1\/\+1|[a-z]+) counter on ~$/.exec(s))) return { ctr: m[1], who: 'self' };
  if (/^aura attached to (?:it|~)$/.test(s)) return { aurasOnIt: true };
  if (/^aura you control that's attached to a creature you control$/.test(s)) return { aurasOnYours: true };
  if (/^aura you control that's attached to a creature$/.test(s)) return { aurasOnYours: true };
  if (/^instant and sorcery card in your graveyard$/.test(s)) return { cards: 'graveyard', pl: 'you', f: { anyType: ['Instant', 'Sorcery'] } };
  if (/^instant and sorcery card in your graveyard$/.test(s)) return { cards: 'graveyard', pl: 'you', f: { anyType: ['Instant', 'Sorcery'] } };
  if (/^creatures? in your party$/.test(s)) return { party: true };
  if (/^creatures? that died this turn$/.test(s)) return { died: true };
  if (/^(?:permanent|creature|artifact|enchantment)s? destroyed this way$/.test(s)) return 'destroyed';
  const fp = parseFilter(s); if (fp && !fp.card && !fp.spell) return { count: fp.f };
  return null;
}
function withForEach(base: Amt, s: string | undefined, cx: Cx): Amt | null {
  if (!s) return base; const fe = forEach(s, cx); if (!fe) return null;
  return base === 1 ? fe : typeof base === 'number' ? { mul: base, of: fe } : null;
}

// ---------- conditions ----------
export function cond(s: string, cx: Cx): Cond | null {
  s = s.trim(); let m: RegExpExecArray | null;
  if (/^it's your turn$/.test(s)) return { k: 'yourTurn' };
  if (/^~ is monstrous$/.test(s)) return { k: 'monstrous' };
  if (/^you control a commander$/.test(s)) return { k: 'ctlCommander' };
  if (/^it's not your turn$/.test(s)) return { k: 'notYourTurn' };
  if (/^it was a creature$/.test(s)) return { k: 'srcType', f: { types: ['Creature'] } };
  if (/^you've cast a noncreature spell this turn$/.test(s)) return { k: 'castNoncThisTurn' };
  if (/^an opponent has cast a spell this turn$/.test(s)) return { k: 'oppCastThisTurn' };
  if (/^you're the monarch$|^you are the monarch$/.test(s)) return { k: 'monarch' };
  if (/^there is no monarch$/.test(s)) return { k: 'noMonarch' };
  if ((m = /^you control (\w+) or fewer other lands$/.exec(s)) && typeof num(m[1]) === 'number') return { k: 'otherLandsLE', n: num(m[1]) as number };
  if (/^(this spell|~|it) was kicked$/.test(s)) return { k: 'kicked' };
  if (/^the gift was promised$/.test(s)) return { k: 'giftPromised' };
  if (/^(this spell was |you )?bargained$/.test(s) || /^you bargained$/.test(s) || /^it was bargained$/.test(s)) return { k: 'bargained' };
  if (/^tribute wasn'?t paid$/.test(s)) return { k: 'tributeUnpaid' };
  if ((m = /^you control (?:at least )?(a|an|another|one|two|three|four|five|six|seven|eight|nine|ten|\d+)(?: or more)? (.+)$/.exec(s))) { const fp = parseFilter(m[2].replace(/,? or (?:a|an) /g, ' or ')); if (fp) { if (m[1] === 'another') fp.f.other = true; return { k: 'control', f: { ...fp.f, ctrl: undefined }, n: m[1] === 'another' ? 1 : num(m[1]) as number }; } }
  if ((m = /^you control no (.+)$|^you don't control (?:a|an|any) (.+)$/.exec(s))) { const fp = parseFilter(m[1] ?? m[2]); return fp ? { k: 'controlNo', f: { ...fp.f, ctrl: undefined } } : null; }
  if ((m = /^you have (\d+) or more life$|^you have at least (\d+) life$/.exec(s))) return { k: 'lifeGE', n: +(m[1] ?? m[2]) };
  if ((m = /^you have (\d+) or less life$/.exec(s))) return { k: 'lifeLE', n: +m[1] };
  if ((m = /^a player has (\d+) or less life$/.exec(s))) return { k: 'anyLifeLE', n: +m[1] };
  if (/^(?:it|this spell|~) targets? a tapped creature$/.test(s)) return { k: 'tgtTappedCreature' };
  if (/^you have no cards in hand$/.test(s)) return { k: 'noCardsHand' };
  if (/^~ attacked or blocked this combat$/.test(s)) return { k: 'atkOrBlkCombat' };
  if (/^it's day$/.test(s)) return { k: 'isDay' };
  if (/^it's night$/.test(s)) return { k: 'isNight' };
  if (/^it's neither day nor night$/.test(s)) return { k: 'neitherDayNight' };
  if (/^no spells were cast last turn$/.test(s)) return { k: 'noSpellsLastTurn' };
  if (/^a player (?:has )?cast two or more spells last turn$/.test(s)) return { k: 'twoSpellsLastTurn' };
  if ((m = /^you have (\w+) or fewer cards in hand$/.exec(s))) return { k: 'handLE', n: num(m[1]) as number };
  if ((m = /^a player has (\w+) or fewer cards in hand$/.exec(s))) return { k: 'anyHandLE', n: num(m[1]) as number };
  if (/^a modified creature died under your control this turn$/.test(s)) return { k: 'modDiedYou' };
  if ((m = /^you have (\w+) or more cards in hand$/.exec(s))) return { k: 'handGE', n: num(m[1]) as number };
  if (/^there are four or more card types among cards in your graveyard$/.test(s) || /^you have delirium$/.test(s)) return { k: 'delirium' };
  if ((m = /^there are (\w+) or more card types among cards in your graveyard$/.exec(s))) { const n0 = num(m[1]); return typeof n0 === 'number' ? { k: 'delirium', n: n0 } : null; }
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
  if ((m = /^an opponent has (\w+) or more poison counters$/.exec(s))) { const n0 = num(m[1]); return typeof n0 === 'number' ? { k: 'oppPoisonGE', n: n0 } : null; }
  if (/^a nonland permanent left the battlefield this turn or a spell was warped this turn$/.test(s)) return { k: 'void' };
  if (/^~ isn't prepared$/.test(s)) return { k: 'not', c: { k: 'prepared' } };
  if (/^~ is untapped$/.test(s)) return { k: 'untapped' };
  if (/^you gained life this turn$|^you've gained life this turn$/.test(s)) return { k: 'lifeGainedThisTurn', n: 1 };
  if (/^you have the city's blessing$/.test(s)) return { k: 'blessing' };
  if (/^a card left your graveyard this turn$/.test(s)) return { k: 'leftGyYou' };
  if ((m = /^a player lost (\w+) or more life this turn$/.exec(s))) { const n0 = num(m[1]); return typeof n0 === 'number' ? { k: 'lostLifeGE', n: n0 } : null; }
  if ((m = /^an opponent has (\w+) or more cards in (?:their|his or her) graveyard$/.exec(s))) { const n0 = num(m[1]); return typeof n0 === 'number' ? { k: 'oppGyGE', n: n0 } : null; }
  if (/^it's the first combat phase of (?:your |the )?turn$/.test(s)) return { k: 'firstCombat' };
  if (/^a counter was put on ~ this turn$/.test(s)) return { k: 'gotCtrSelf' };
  if (/^you put a counter on a creature this turn$/.test(s)) return { k: 'putCtrYou' };
  if ((m = /^you(?:'ve)? gained (\d+) or more life this turn$/.exec(s))) return { k: 'lifeGainedThisTurn', n: +m[1] };
  if (/^a creature died this turn$/.test(s)) return { k: 'creatureDiedThisTurn' };
  if (/^you descended this turn$/.test(s)) return { k: 'descended' };
  if ((m = /^x is (\d+) or more$/.exec(s))) return { k: 'xGE', n: +m[1] };
  if ((m = /^an opponent has (\d+) or less life$/.exec(s))) return { k: 'oppLifeLE', n: +m[1] };
  if (/^you attacked this turn$/.test(s)) return { k: 'attackedThisTurn' };
  if (/^you created a token this turn$/.test(s)) return { k: 'createdTokenThisTurn' };
  if ((m = /^(?:~|it) has (\w+) or more (\+1\/\+1|[a-z]+) counters? on it$/.exec(s))) { const n0 = num(m[1]); return typeof n0 === 'number' ? { k: 'ctrGE', kind: m[2], n: n0 } : null; }
  if (/^(that creature|it|~) is attacking$/.test(s)) return { k: 'attacking' };
  if (/^the discarded card wasn't a land card$/.test(s)) return { k: 'chosenNonland' };
  if ((m = /^(?:the creature|it|that creature) had power (\d+) or greater$/.exec(s))) return { k: 'evPowGE', n: +m[1] };
  if ((m = /^(?:it|that creature|that card|that land|that permanent|it was) (?:is|was|'s) (?:a|an) (.+)$|^it's (?:a|an) (.+)$/.exec(s))) { const fp = parseFilter(m[1] ?? m[2]); return fp ? { k: 'evIs', f: fp.f } : null; }
  if (/^(it|that creature) was a creature you control$|^you controlled it$/.test(s)) return { k: 'evCtlYou' };
  if ((m = /^(?:it|that permanent|that artifact)(?:'s not| isn't) an? ([a-z]+)$/.exec(s))) { const fp = parseFilter(m[1]); return fp ? { k: 'not', c: { k: 'refIs', ref: cx.it ?? 'self', f: fp.f } } : null; }
  if (/^there are four or more card types among cards in your graveyard$/.test(s) || /^you have delirium$/.test(s)) return { k: 'delirium' };
  if ((m = /^there are (\w+) or more card types among cards in your graveyard$/.exec(s))) { const n0 = num(m[1]); return typeof n0 === 'number' ? { k: 'delirium', n: n0 } : null; }
  if (/^you control a creature with power 4 or greater$/.test(s)) return { k: 'control', f: { types: ['Creature'], powGE: 4 }, n: 1 };
  if (/^you control seven or more lands with different names$/.test(s)) return { k: 'uniqLandsGE', n: 7 };
  if (/^there are thirteen or more creatures on the battlefield$/.test(s)) return { k: 'creaturesGE', n: 13 };
  if (/^you attacked with two or more creatures this turn$/.test(s)) return { k: 'atkGE', n: 2 };
  if (/^creatures you control have total power 8 or greater$/.test(s)) return { k: 'formidable' };
  if ((m = /^creatures you control have total power (\w+) or greater$/.exec(s))) { const n0 = num(m[1]); return typeof n0 === 'number' ? { k: 'powSumGE', n: n0 } : null; }
  if (/^you control three or more artifacts$/.test(s)) return { k: 'control', f: { types: ['Artifact'] }, n: 3 };
  if (/^you attacked with a creature this turn$/.test(s)) return { k: 'attackedThisTurn' };
  if (/^you attacked with creatures with total power 6 or greater this turn$/.test(s)) return { k: 'packTactics' };
  if ((m = /^you attacked with creatures with total power (\w+) or greater this turn$/.exec(s))) { const n0 = num(m[1]); return typeof n0 === 'number' ? { k: 'packTactics', n: n0 } : null; }
  if (/^this spell was cast during your main phase$/.test(s) || /^you cast (?:this spell|it|~) during your main phase$/.test(s)) return { k: 'yourMain' };
  if (/^there are two or more instant (?:and|or|and\/or) sorcery cards in your graveyard$/.test(s)) return { k: 'spellMastery' };
  if (/^you control your commander$/.test(s)) return { k: 'ctlCommander' };
  if (/^(you cast it|it was cast|~ was cast)$/.test(s)) return { k: 'wasCast' };
  if (/^you cast it from your hand$/.test(s) || /^(?:this spell|~|it) was? cast from your hand$/.test(s)) return { k: 'castFromHand' };
  if ((m = /^(?:~|it) is an? (.+)$/.exec(s))) { const fp = parseFilter(m[1]); return fp ? { k: 'srcType', f: fp.f } : null; }
  if (/^~ is in your graveyard$/.test(s)) return { k: 'srcZone', zone: 'graveyard' };
  if (/^an opponent lost life this turn$/.test(s)) return { k: 'oppLostLife', n: 1 };
  if (/^a creature died under your control this turn$/.test(s)) return { k: 'diedYou' };
  if (/^no creatures are on the battlefield$/.test(s)) return { k: 'noCreatures' };
  if ((m = /^(?:that player|they) (?:has|have) (\w+) or fewer cards in hand$/.exec(s))) { const n0 = num(m[1]); return typeof n0 === 'number' ? { k: 'evHandLE', n: n0 } : null; }
  if (/^you have a full party$/.test(s)) return { k: 'fullParty' };
  if (/^it escaped$/.test(s)) return { k: 'escaped' };
  if ((m = /^\{([wubrg])\} was spent to cast (?:it|this spell|~)$/.exec(s))) return { k: 'spentColor', color: m[1].toUpperCase() as Color };
  if ((m = /^there is an? (.+?) cards? in your graveyard$/.exec(s))) { const fp = parseFilter(m[1] + ' card'); return fp ? { k: 'gyGE', n: 1, f: fp.f } : null; }
  { const mm = /^at least (\w+) mana was spent to cast (?:that spell|it|~)$/.exec(s); const nn = num(mm?.[1]); if (mm && typeof nn === 'number') return { k: 'spentGE', n: nn }; }
  if (/\bor\b/.test(s) && !/ or (?:more|fewer|less|equal)\b/.test(s)) {
    const i = s.lastIndexOf(' or ');
    if (i > 0) {
      const a = cond(s.slice(0, i), cx); const b = cond(s.slice(i + 4), cx);
      if (a && b) return { k: 'or', or: [a, b] };
    }
  }
  return null;
}

// ---------- tokens ----------
const PRESETS = ['lander', 'heartwood', 'treasure', 'food', 'clue', 'blood', 'gold', 'powerstone', 'map', 'vibranium'];
function tokenSpec(s: string): TokenSpec | null {
  s = s.trim(); let extraKw: string[] | undefined;
  { const wm = /^(.*?) with ([a-z ,]+)$/.exec(s); if (wm) { const k = kwList(wm[2]); if (k) { s = wm[1].trim(); extraKw = k; } } }
  const w = s.split(' '); let i = 0; let p: number | undefined, t: number | undefined; const colors: Color[] = []; const types: string[] = []; const sub: string[] = []; let legendary = false; let named = '';
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
  return { name: named || sub.join(' ') || types.join(' '), p, t, colors, types, sub, legendary: legendary || undefined, kws: extraKw };
}
function kwList(s: string): string[] | null {
  s = s.replace(/protection from each color/g, 'protection from white, protection from blue, protection from black, protection from red, protection from green');
  const parts = s.replace(/, and |, | and /g, '|').split('|').map(x => x.trim());
  return parts.every(p => KWS.includes(p)) ? parts : null;
}

// ---------- mana ----------
export function manaAdd(s: string, cx: Cx): { mana: ManaSym[]; n?: Amt } | null {
  let m: RegExpExecArray | null; s = s.trim();
  if ((m = /^(.+?) for each (.+)$/.exec(s))) { const b = manaAdd(m[1], cx); const fe = forEach(m[2], cx); if (!b || !fe || b.n) return null; return { mana: b.mana, n: fe }; }
  if ((m = /^an amount of (\{[wubrgc]\}) equal to (.+)$/.exec(s))) { const a = amount(m[2], cx); return a === null ? null : { mana: [m[1][1].toUpperCase() as ManaSym], n: a }; }
  if (/^one mana of any colou?r$/.test(s)) return { mana: ['ANY'] };
  if (/^one mana of the chosen colou?r$/.test(s)) return { mana: ['CHOSEN'] };

  if (/^one mana of any colou?r in your commander's colou?r identity$/.test(s)) return { mana: ['IDENTITY'] };
  if (/^one mana of any colou?r that a land an opponent controls could produce$/.test(s)) return { mana: ['OPP'] };
  if (/^one mana of any type that a land you control could produce$/.test(s)) return { mana: ['MINE'] };
  if (/^one mana of any colou?r among legendary permanents you control$/.test(s)) return { mana: ['LEGEND'] };
  if (/^one mana of any colou?r among legendary creatures and planeswalkers you control$/.test(s)) return { mana: ['LEGEND_CP'] };
  if (/^one mana of any of the exiled card's colou?rs$/.test(s)) return { mana: ['IMPRINT'] };
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
  [/^§pact ((?:\{[^}]+\})+)$/, (m) => [{ op: 'pactPay', text: m[1].toUpperCase() }]],
  [/^add ((?:\{[^}]+\})+) instead if (.+)$/, (m, cx) => { const r = manaAdd(m[1], newCx()); const c = cond(m[2], cx); return r && c ? [{ op: 'if', cond: c, sub: [{ op: 'addMana', mana: r.mana as string[], n: r.n ?? 1 }] }] : null; }],
  [/^you get ((?:\{e\})+)$/, (m) => { const n = (m[1].match(/\{e\}/g) || []).length; return n ? [{ op: 'energy', n, pl: 'you' }] : null; }],
  [/^get ((?:\{e\})+)$/, (m) => { const n = (m[1].match(/\{e\}/g) || []).length; return n ? [{ op: 'energy', n, pl: 'you' }] : null; }],
  [/^(?:you )?get (one|two|three|four|five|six|seven|eight|nine|ten|\d+) \{e\}$/, (m) => { const n = ({ one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10 } as Record<string, number>)[m[1]] ?? +m[1]; return n ? [{ op: 'energy', n, pl: 'you' }] : null; }],
  [/^flip (?:~|this creature|it)$/, () => [{ op: 'flip', who: 'self' }]],

  [/^double the number of each kind of counter on (.+)$/, (m, cx) => { const o = obj(m[1], cx, true); return o && !o.card ? [{ op: 'doubleCtr', who: o.ref }] : null; }],
  [/^untap all creatures that attacked this turn$/, () => [{ op: 'untap', who: { all: { types: ['Creature'], ctrl: 'you', attackedT: true } } }]],
  [/^choose a color$/, () => [{ op: 'chooseColor' }]],
  [/^add an amount of mana of that color equal to (.+)$/, (m, cx) => { const a = amount(m[1], cx); return a !== null ? [{ op: 'addManaOne', n: a }] : null; }],
  [/^add one mana of that color for each charge counter on (?:~|it)$/, () => [{ op: 'addManaOne', n: { ctr: 'charge', who: 'self' } }]],
  [/^spend this mana only to cast (?:an artifact spell or activate an ability of an artifact source|your commander)$/, () => [{ op: 'noop' }]],
  [/^exile (?:it|that token) at the beginning of the next end step$/, () => [{ op: 'delayExile', who: 'created' }]],
  [/^exile (?:it|that token) at end of combat$/, () => [{ op: 'delayExile', who: 'created', kind: 'combat' }]],
  [/^exile target opponent's graveyard$/, (_m, cx) => { playerRef('target opponent', cx, true); return [{ op: 'exileGrave', pl: 't' + (cx.slots.length - 1) }]; }],
  [/^exile target player's graveyard$/, (_m, cx) => { playerRef('target player', cx, true); return [{ op: 'exileGrave', pl: 't' + (cx.slots.length - 1) }]; }],
  [/^each player shuffles their hand and graveyard into their library, then draws seven cards$/, () => [{ op: 'echoEons' }]],
  [/^create a number of (.+?) tokens?(?: with (.+?))? equal to the number of opponents you have$/, (m) => { const tok = tokenSpec(m[1]); if (!tok) return null; if (m[2]) { const k = kwList(m[2]); if (!k) return null; tok.kws = k; } return [{ op: 'token', n: { opps: true }, pl: 'you', tok }]; }],
  [/^destroy all creatures\. you gain 1 life for each creature destroyed this way$/, () => [{ op: 'destroy', who: { all: { types: ['Creature'] } } }, { op: 'gain', n: 'destroyed', pl: 'you' }]],
  [/^destroy (.+?)\. you gain (\w+) life for each (?:permanent|creature|artifact|enchantment)s? destroyed this way$/, (m, cx) => {
    const o = obj(m[1], cx, true); const k = num(m[2]); if (!o || o.card || k === null) return null;
    return [{ op: 'destroy', who: o.ref }, { op: 'gain', n: k === 1 ? 'destroyed' : { mul: k as number, of: 'destroyed' }, pl: 'you' }];
  }],
  [/^destroy (.+?)\. you gain life equal to (?:that creature's|its) toughness$/, (m, cx) => {
    const o = obj(m[1], cx, true); if (!o || o.card) return null;
    return [{ op: 'gain', n: { tough: o.ref }, pl: 'you' }, { op: 'destroy', who: o.ref }];
  }],
  [/^support (\d+)$/, (m, cx) => { const o = obj(`up to ${+m[1]} target creatures`, cx, false); return o ? [{ op: 'addC', kind: '+1/+1', n: 1, who: o.ref }] : null; }],
  [/^incubate (x|\w+)(?:, where x is (.+))?$/, (m, cx) => {
    const a = m[1] === 'x' && m[2] ? amount(m[2], cx) : num(m[1]);
    return a !== null ? [{ op: 'incubate', n: a }] : null;
  }],
  [/^bolster (\d+)$/, m => [{ op: 'bolster', n: +m[1] }]],
  [/^manifest dread$/, () => [{ op: 'manifestDread' }]],
  [new RegExp(`^(?:${P_RE} )?loses? half (?:their|your|his or her) life, rounded up$`), (m, cx) => {
    const p = pl(m[1], cx, true); if (!p) return null;
    return [{ op: 'lose', n: { half: { life: p } }, pl: p }];
  }],
  [/^create (?:a|one) token that's a copy of (.+?), except it has ([a-z ,]+)$/, (m, cx) => {
    const o = obj(m[1], cx, false); const k = kwList(m[2]);
    return o && k ? [{ op: 'copyTok', n: 1, who: o.ref, kw: k }] : null;
  }],
  [/^destroy all creatures$/, () => [{ op: 'destroy', who: { all: { types: ['Creature'] } } }]],
  [/^create x 1\/1 colorless borg artifact creature tokens, where x is the number of nonartifact creatures destroyed this way$/, () => [{ op: 'token', n: 'destroyedNonArt', pl: 'you', tok: { name: 'Borg', p: 1, t: 1, colors: [], types: ['Artifact', 'Creature'], sub: ['Borg'] } }]],

  [/^exile the borg assimilated with (?:this saga|~), then return it to the battlefield under its owner's control$/, () => [{ op: 'assimilateBlink' }]],
  [/^target opponent exiles cards from the top of their library until they exile a creature card$/, (m, cx) => { playerRef('target opponent', cx, true); return [{ op: 'revealUntil', pl: 't' + (cx.slots.length - 1), f: { types: ['Creature'] }, rest: 'bottom' }, { op: 'assimilate', kind: 'one' }, { op: 'putBackExBy' }]; }],
  [/^they put the rest on the bottom in a random order$/, () => [{ op: 'noop' }]],
  [/^each opponent reveals cards from the top of their library until they reveal a creature card$/, () => [{ op: 'revealUntil', pl: 'opps', f: { types: ['Creature'] }, rest: 'bottom', reveal: true }, { op: 'assimilate', kind: 'one' }, { op: 'putBackExBy' }]],
  [/^assimilate one of the creature cards revealed this way$/, () => [{ op: 'noop' }]],
  [/^each opponent puts the other cards they revealed this way on the bottom of their library in a random order$/, () => [{ op: 'noop' }]],
  [/^assimilate that card$/, () => [{ op: 'noop' }]],

  [/^assimilate (.+)$/, (m, cx) => {
    if (/^target /.test(m[1]) || /creature card/.test(m[1]) || /that card|it|them|those/.test(m[1])) {
      const o = obj(m[1], cx, false);
      return o ? [{ op: 'assimilate', who: o.ref }] : [{ op: 'assimilate' }];
    }
    return null;
  }],
  [/^for each opponent, assimilate up to one target creature card from that player's graveyard that was put there from the battlefield this turn$/, (m, cx) => {
    // one optional card slot per opponent (up to 3 in commander)
    const i = cx.slots.length;
    for (let k = 0; k < 3; k++) addSlot(cx, { who: 'card', f: { types: ['Creature'], fromBfT: true }, zoneOwner: 'opp', opt: true, oppIdx: k, grp: i });
    return [{ op: 'assimilate', who: `tr:${i}-${i + 2}` }];
  }],
  [/^you and (.+) each draw (\w+) cards?$/, (m, cx) => { const p = playerRef(m[1], cx, true); const k = num(m[2]); return p && k !== null ? [{ op: 'draw', n: k, pl: 'you' }, { op: 'draw', n: k, pl: p }] : null; }],
  [/^(.+) and you each draw (\w+) cards?$/, (m, cx) => { const p = playerRef(m[1], cx, true); const k = num(m[2]); return p && k !== null ? [{ op: 'draw', n: k, pl: 'you' }, { op: 'draw', n: k, pl: p }] : null; }],
  [/^create (?:a|one) token that's a copy of (.+?), except (?:it|the token) isn't legendary, it's an? ([a-z]+) artifact in addition to its other types, and it has haste$/, (m, cx) => {
    const o = obj(m[1], cx, false); const sub = typeWord(m[3]); 
    return o ? [{ op: 'copyTok', n: 1, who: o.ref, kind: 'nl', kw: ['haste'], ce: { addTypes: ['Artifact'], addSub: sub ? [sub] : [] } }] : null;
  }],
  [/^create a token that's a copy of (.+?), except (?:it|the token) isn't legendary and it's an? ([a-z]+) artifact in addition to its other types$/, (m, cx) => {
    const o = obj(m[1], cx, false); const sub = typeWord(m[2]);
    return o ? [{ op: 'copyTok', n: 1, who: o.ref, kind: 'nl', ce: { addTypes: ['Artifact'], addSub: sub ? [sub] : [] } }] : null;
  }],
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
  [/^return (?:that card|it) to the battlefield(?: under (its owner's|your) control)? at the beginning of the next end step$/, (m, cx) => [{ op: 'delayRet', who: cx.that ?? cx.it ?? 'ev', zone: 'graveyard', ctl: m[1] === 'your' ? 'you' : undefined }]],
  [/^draw (\w+) cards, then put (?:a|one) card from your hand on the bottom of your library$/, m => { const k = num(m[1]); return typeof k === 'number' ? [{ op: 'draw', n: k, pl: 'you' }, { op: 'putBack', n: 1, dest: 'bottom' }] : null; }],
  [/^each opponent loses life equal to the life that player lost this turn$/, () => [{ op: 'loseEachLost' }]],
  [/^populate$/, () => [{ op: 'script', kind: 'populate' }]],
  [/^until end of turn, any time you could activate a mana ability, you may pay 1 life. if you do, add \{c\}$/, () => [{ op: 'script', kind: 'channel' }]],
  [/^§uginx (?:a |an )?(.+?) tokens?$/, mm => { const t = tokenSpec(mm[1]); return t ? [{ op: 'exileLinkTok', tok: t }] : null; }],
  [/^§exilecast (free)?\|(.+)$/, (mm, cx) => { const e = clause(mm[2], cx); return e ? [{ op: 'exileTopCast', free: !!mm[1], else: e }] : null; }],
  [/^§searchexilefree (.+)$/, mm => { const fp = parseFilter(mm[1] + ' card'); return fp ? [{ op: 'search', n: 99, f: fp.f, dest: 'exile', text: mm[1] + ' card' }, { op: 'mayCastFree', who: 'chosen' }] : null; }],
  [/^add (\w+) mana of any one color$/, (mm, cx) => { const k = mm[1] === 'x' ? (cx.xAmt ?? 'X') : num(mm[1]); return k !== null && k !== undefined ? [{ op: 'addManaOne', n: k }] : null; }],
  [/^(you|target opponent|target player|each opponent) gets? emblem#(\d+)$/, (m, cx) => { const d = emblemDef(EMB[+m[2]]); const p = m[1] === 'you' ? 'you' : playerRef(m[1], cx, m[1] !== 'target player'); return d && p ? [{ op: 'emblem', pl: p, emb: d }] : null; }],
  [/^gain control of (.+?)( until end of turn| until the end of your next turn)?$/, (m, cx) => { const o = obj(m[1], cx, true); return o && !o.card ? [{ op: 'steal', who: o.ref, until: !m[2] ? undefined : /next turn/.test(m[2]) ? 'yourNext' : 'eot' }] : null; }],
  [/^untap (.+)$/, (m, cx) => { const o = obj(m[1], cx, false); return o && !o.card ? [{ op: 'untap', who: o.ref }] : null; }],
  [/^tap (.+)$/, (m, cx) => { const o = obj(m[1], cx, true); return o && !o.card ? [{ op: 'tap', who: o.ref }] : null; }],
  [/^sacrifice (?:it|that creature|that permanent) at the beginning of the next end step$/, (m, cx) => [{ op: 'delaySac', who: cx.it ?? cx.that ?? 't0' }]],
  [/^sacrifice (?:it|that creature|that permanent) at end of combat$/, (m, cx) => [{ op: 'delaySac', who: cx.it ?? cx.that ?? 't0', kind: 'combat' }]],
  [/^~ becomes a copy of target (.+?) until end of turn(?:, except (.+))?$/, (m, cx) => {
    const o = obj('target ' + m[1], cx, false); if (!o) return null;
    const ex = parseCopyExcept(m[2] ? 'except ' + m[2] : undefined); if (ex === 'fail') return null;
    return [{ op: 'becomesCopy', who: 'self', other: o.ref, eot: true, except: ex }];
  }],
  [/^~ becomes a copy of target (.+?)(?:, except (.+))?$/, (m, cx) => {
    const o = obj('target ' + m[1], cx, false); if (!o) return null;
    const ex = parseCopyExcept(m[2] ? 'except ' + m[2] : undefined); if (ex === 'fail') return null;
    return [{ op: 'becomesCopy', who: 'self', other: o.ref, except: ex }];
  }],
  [/^target (.+?) becomes a copy of target (.+?) until end of turn(?:, except (.+))?$/, (m, cx) => {
    const a = obj('target ' + m[1], cx, false); const b = obj('target ' + m[2], cx, false); if (!a || !b) return null;
    const ex = parseCopyExcept(m[3] ? 'except ' + m[3] : undefined); if (ex === 'fail') return null;
    return [{ op: 'becomesCopy', who: a.ref, other: b.ref, eot: true, except: ex }];
  }],
  [/^until end of turn, target (.+?) becomes a copy of target (.+?)(?:, except (.+))?$/, (m, cx) => {
    const a = obj('target ' + m[1], cx, false); const b = obj('target ' + m[2], cx, false); if (!a || !b) return null;
    const ex = parseCopyExcept(m[3] ? 'except ' + m[3] : undefined); if (ex === 'fail') return null;
    return [{ op: 'becomesCopy', who: a.ref, other: b.ref, eot: true, except: ex }];
  }],
  [/^each other (.+?) becomes a copy of target (.+?) until end of turn(?:, except (.+))?$/, (m, cx) => {
    const fp = parseFilter(m[1]); if (!fp) return null;
    const o = obj('target ' + m[2], cx, false); if (!o) return null;
    const ex = parseCopyExcept(m[3] ? 'except ' + m[3] : undefined); if (ex === 'fail') return null;
    return [{ op: 'becomesCopy', who: { all: { ...fp.f, other: true } }, other: o.ref, eot: true, except: ex }];
  }],
  [/^prevent all combat damage that would be dealt this turn$/, () => [{ op: 'prevent', kind: 'combat' }]],
  [/^prevent all damage that would be dealt this turn$/, () => [{ op: 'prevent', kind: 'all' }]],
  [/^prevent all damage that would be dealt by creatures this turn$/, () => [{ op: 'prevent', kind: 'fromCreatures' }]],
  [/^prevent all damage that would be dealt to you this turn$/, () => [{ op: 'prevent', kind: 'toYou' }]],
  [/^prevent all combat damage that would be dealt to you this turn$/, () => [{ op: 'prevent', kind: 'combatYou' }]],
  [/^prevent all (combat )?damage that would be dealt to (.+?) this turn$/, (m, cx) => { const o = obj(m[2], cx, false); return o ? [{ op: 'prevent', kind: m[1] ? 'toPermCombat' : 'toPerm', who: o.ref }] : null; }],
  [/^prevent the next (\w+) damage that would be dealt to (.+?) this turn$/, (m, cx) => { const n0 = num(m[1]); const o = obj(m[2], cx, false); return typeof n0 === 'number' && o ? [{ op: 'prevent', kind: 'nextN', n: n0, who: o.ref }] : null; }],
  [/^the next (\w+) damage that would be dealt to (.+?) this turn is dealt to ((?:another )?target creature(?: you control)?) instead$/, (m, cx) => {
    const n0 = num(m[1]); const fr = obj(m[2], cx, false); const to = obj(m[3], cx, true);
    return typeof n0 === 'number' && fr && to && !to.card ? [{ op: 'redirectNext', n: n0, who: fr.ref, other: to.ref }] : null;
  }],
  [/^§seize (target (?:player|opponent))\|(.+)\|(graveyard|exile|exile\+gy)$/, (m, cx) => { const pl = playerRef(m[1], cx, true); const fp = parseFilter(m[2]); return pl && fp ? [{ op: 'discardChosen', pl, f: fp.f, dest: m[3].startsWith('exile') ? 'exile' : 'graveyard', zone: m[3] === 'exile+gy' ? 'handOrGy' : 'hand' }] : null; }],
  [/^draw a card at the beginning of the next turn's upkeep$/, () => [{ op: 'arcaneDraws', kind: 'you' }]],
  [/^investigate twice$/, () => [{ op: 'token', n: 2, pl: 'you', tok: { name: 'Clue', colors: [], types: ['Artifact'], preset: 'Clue' } }]],
  [/^investigate (x|\w+) times(?:, where x is (.+))?$/, (m, cx) => { const a = m[1] === 'x' && m[2] ? amount(m[2], cx) : num(m[1]); return a !== null ? [{ op: 'token', n: a, pl: 'you', tok: { name: 'Clue', colors: [], types: ['Artifact'], preset: 'Clue' } }] : null; }],
  [/^(?:you )?take (an|two|three) extra turns? after this one$/, m => [{ op: 'extraTurn', n: num(m[1]) as number }]],
  [/^target player takes (an|two|three) extra turns? after this one$/, (m, cx) => { const p = playerRef('target player', cx, false); return p ? [{ op: 'extraTurn', n: num(m[1]) as number, pl: p }] : null; }],
  [/^at the beginning of that turn's end step, you lose the game$/, () => [{ op: 'loseAtExtraEnd' }]],
  [/^at the beginning of your next upkeep, pay ((?:\{[^}]+\})+)\. if you don't, you lose the game$/, (m) => { const c = parseCost(m[1].toUpperCase()); return c ? [{ op: 'pactPay', mana: Object.entries(c).flatMap(([k, v]) => k === 'generic' ? [] : Array(v as number).fill(k)), n: c.generic, text: m[1].toUpperCase() }] : null; }],
  [/^your opponents can't cast spells this turn$/, () => [{ op: 'silence' }]],
  [/^the next spell you cast this turn can't be countered$/, () => [{ op: 'nextUnc' }]],
  [/^return it to the battlefield under its owner's control\. it's an enchantment$/, () => [{ op: 'retAsEnch', who: 'self' }]],
  [/^add ((?:\{[^}]+\})+)\. threshold[-—] add ((?:\{[^}]+\})+) instead if there are seven or more cards in your graveyard$/, (m) => { const r1 = manaAdd(m[1], newCx()); const r2 = manaAdd(m[2], newCx()); return r1 && r2 ? [{ op: 'if', cond: { k: 'cardsInGyGE', n: 7 }, sub: [{ op: 'addMana', mana: r2.mana as string[], n: r2.n ?? 1 }], else: [{ op: 'addMana', mana: r1.mana as string[], n: r1.n ?? 1 }] }] : null; }],
  [/^permanents your opponents control lose (.+) until end of turn$/, (m) => { const k = kwList(m[1]); return k ? [{ op: 'loseKwUntil', kw: k, who: 'opps' }] : null; }],
  [/^copy (target instant or sorcery spell(?: you control)?)$/, (m, cx) => { const o = obj(m[1], cx, true); return o ? [{ op: 'copyStack', who: o.ref }] : null; }],
  [/^when you next cast an instant or sorcery spell this turn, copy that spell$/, () => [{ op: 'nextCopyIS' }]],

  [/^it becomes day$/, () => [{ op: 'becomeDay' }]],
  [/^it becomes night$/, () => [{ op: 'becomeNight' }]],
  [/^if it's night, it becomes day\. otherwise, it becomes night$/, () => [{ op: 'toggleDayNight' }]],
  [/^~ phases out$/, () => [{ op: 'phaseOut', who: 'self' }]],
  [/^equipped creature phases out$/, () => [{ op: 'phaseOut', who: 'attached' }]],
  [/^(.+) phases? out$/, (m, cx) => { const o = obj(m[1], cx, false); return o && !o.card ? [{ op: 'phaseOut', who: o.ref }] : null; }],
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
  [new RegExp(`(?:${P_RE} )?draws? an additional card$`), (m, cx) => { const p = pl(m[1], cx, false) ?? 'you'; return [{ op: 'draw', n: 1, pl: p }]; }],
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
  [/^(~|it|.+?) deals? damage equal to (.+?) to (.+)$/, (m, cx) => { if (m[1] !== '~' && m[1] !== 'it') { const src = obj(m[1], cx, false); if (!src) return null; const a = amount(m[2], { ...cx, it: src.ref }) ?? amount(m[2], cx); if (!a) return null; if (/^itself$|^himself$|^herself$/.test(m[3])) return [{ op: 'damage', n: a, who: src.ref }]; const t = obj(m[3], cx, true); if (!t) return null; return typeof a === 'object' && 'pow' in a ? [{ op: 'bite', who: src.ref, other: t.ref }] : [{ op: 'damage', n: a, who: t.ref }]; } const a = amount(m[2], cx); return a === null ? null : dmg(m[1], a, m[3], cx); }],
  [/^(.+?) deals? damage to (.+?) equal to (.+)$/, (m, cx) => { const a = amount(m[3], cx); return a === null ? null : dmg(m[1], a, m[2], cx); }],
  [/^destroy (target [a-z ]+?) and (target [a-z ]+)$/, (m, cx) => { const a = obj(m[1], cx, true); const b = a && obj(m[2], cx, true); return a && b && !a.card && !b.card ? [{ op: 'destroy', who: a.ref }, { op: 'destroy', who: b.ref }] : null; }],
  [/^destroy (.+?)$/, (m, cx) => { const o = obj(m[1], cx, true); return o && !o.card ? [{ op: 'destroy', who: o.ref }] : null; }],
  [/^exile (.+?) until ~ leaves the battlefield$/, (m, cx) => { const o = obj(m[1], cx, true); return o ? [{ op: 'script', kind: 'ring', who: o.ref }] : null; }],
  [/^exile (.+?)$/, (m, cx) => { if (/until/.test(m[0])) return null; const o = obj(m[1], cx, true); return o ? [{ op: 'exile', who: o.ref }] : null; }],
  [/^return (a|an) (.+?) you control to its owner's hand$/, m => { const fp = parseFilter(m[2]); return fp ? [{ op: 'sac', f: { ...fp.f, ctrl: 'you' }, n: 1, pl: 'you', dest: 'hand' }] : null; }],
  [/^return (.+?) to (?:its owner's|their owners'|your|their owner's) hands?$/, (m, cx) => { const o = (/\btarget .*graveyard$/.test(m[1]) ? obj(m[1], cx, false) : null) ?? obj(m[1].replace(/ from your graveyard$| from a graveyard$/, ''), cx, !/graveyard/.test(m[1])); if (!o) { const o2 = gyObj(m[1], cx); return o2 ? [{ op: 'ret', who: o2, dest: 'hand' }] : null; } return [{ op: o.card || /graveyard/.test(m[1]) ? 'ret' : 'bounce', who: o.ref, dest: 'hand' }]; }],
  [/^return (.+?) to the battlefield( tapped)?(?: under (your|its owner's|their owners'|their owner's) control)?( tapped)?$/, (m, cx) => { const o = (/\btarget .*graveyard$/.test(m[1]) ? obj(m[1], cx, false) : null) ?? obj(m[1].replace(/ from your graveyard$| from a graveyard$/, ''), cx, false) ?? (gyObj(m[1], cx) ? { ref: gyObj(m[1], cx)! } : null); return o ? [{ op: 'ret', who: o.ref, dest: 'battlefield', tapped: !!(m[2] || m[4]), ctl: m[3] === 'your' ? 'you' : undefined }] : null; }],
  [/^put (target .+? card from (?:a|your|an opponent's) graveyard) onto the battlefield( tapped)? under your control$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'ret', who: o.ref, dest: 'battlefield', tapped: !!m[2], ctl: 'you' }] : null; }],
  [/^exile (target player's|each opponent's|each player's|all|all opponents') graveyards?$/, (m, cx) => { const p = m[1] === 'all' ? 'all' : playerRef(m[1].replace(/'s?$/, ''), cx, true); return p ? [{ op: 'exileGrave', pl: p }] : null; }],
  [/^(?:then )?put (two|three|a|one) cards? from your hand on top of your library(?: in any order)?$/, m => [{ op: 'putBack', n: num(m[1])! }]],
  [/^untap (?:up to )?(one|two|three|four|five) lands$/, m => [{ op: 'untapLands', n: num(m[1])! }]],
  [/^counter (target .+?) unless its controller pays \{(\d+|x)\}$/, (m, cx) => { const o = obj(m[1], cx, true); if (!o) return null; const g = m[2] === 'x' ? 0 : +m[2]; return [{ op: 'unless', pl: 'ctl:t0', ifPaid: { generic: g, x: m[2] === 'x' ? 1 : 0 }, text: 'the spell is countered', sub: [{ op: 'counter', who: o.ref }] }]; }],
  [/^put (.+?) on (top|the bottom) of (?:its owner's|their owners'|your) librar(?:y|ies)$/, (m, cx) => { const o = obj(m[1], cx, m[2] !== 'top'); if (!o) return null; return o.card ? [{ op: 'ret', who: o.ref, dest: m[2] === 'top' ? 'top' : 'bottom', zone: 'graveyard' }] : [{ op: 'tuck', who: o.ref, dest: m[2] === 'top' ? 'top' : 'bottom' }]; }],
  [/^(tap|untap) (.+)$/, (m, cx) => { const o = obj(m[2], cx, m[1] === 'tap'); return o && !o.card ? [{ op: m[1], who: o.ref }] : null; }],
  [/^counter ((?:up to \w+ )?target .+)$/, (m, cx) => { const o = obj(m[1], cx, true); const w = cx.slots[cx.slots.length - 1]?.who; return o && (w === 'spell' || w === 'ability' || w === 'stack') ? [{ op: 'counter', who: o.ref }] : null; }],
  [/^counter (target .+?)\. if that spell is countered this way, exile it instead of putting it into its owner's graveyard$/, (m, cx) => { const o = obj(m[1], cx, true); const w = cx.slots[cx.slots.length - 1]?.who; return o && (w === 'spell' || w === 'ability' || w === 'stack') ? [{ op: 'counter', who: o.ref, dest: 'exile' }] : null; }],
  [/^counter target spell if it's blue$/, (m, cx) => { const o = obj('target spell', cx, true); return o ? [{ op: 'if', cond: { k: 'evIs', f: { colors: ['U'] } }, sub: [{ op: 'counter', who: o.ref }] }] : null; }],
  [/^destroy target permanent if it's blue$/, (m, cx) => { const o = obj('target permanent', cx, true); return o ? [{ op: 'if', cond: { k: 'evIs', f: { colors: ['U'] } }, sub: [{ op: 'destroy', who: o.ref }] }] : null; }],
  [new RegExp(`^put (${N}|that many|x|an additional) ([+-]\\d\\/[+-]\\d|[a-z]+) counters? on (.+?)(?: for each (.+))?$`), (m, cx) => { const k = m[2]; const harm = k === '-1/-1'; const o = obj(m[3], cx, harm); const a = m[1] === 'an additional' ? 1 : num(m[1]) ?? 'ev'; const n = withForEach(a, m[4], cx); return o && !o.card && n !== null ? [{ op: 'addC', kind: k, n, who: o.ref }] : null; }],
  [/^remove (a|an|one|two|three|x|all) ([+-]\d\/[+-]\d|[a-z]+) counters? from (.+)$/, (m, cx) => { const o = obj(m[3], cx, false); return o ? [{ op: 'remC', kind: m[2], n: m[1] === 'all' ? 99 : num(m[1])!, who: o.ref }] : null; }],
  [/^proliferate$/, () => [{ op: 'proliferate' }]],
  [/^proliferate x times$/, () => [{ op: 'proliferate', n: 'X' }]],
  [/^you become the monarch$/, () => [{ op: 'monarch', pl: 'you' }]],
  [/^choose a creature type( §keep)?$/, m => [{ op: 'chooseType', text: m[1] ? 'keep' : undefined }]],
  [new RegExp(`^put (${N}) ([+-]\\d\\/[+-]\\d|[a-z]+) counters? on (.+?) and (${N}) ([+-]\\d\\/[+-]\\d|[a-z]+) counters? on (.+)$`), (m, cx) => { const a = obj(m[3], cx, m[2] === '-1/-1'); const b = a && obj(m[6], cx, m[5] === '-1/-1'); const x = num(m[1]), y = num(m[4]); return a && b && !a.card && !b.card && typeof x === 'number' && typeof y === 'number' ? [{ op: 'addC', kind: m[2], n: x, who: a.ref }, { op: 'addC', kind: m[5], n: y, who: b.ref }] : null; }],
  [/^(.+?) becomes? (?:artifact )?creatures? with base power and toughness (\d+)\/(\d+) until end of turn$/, (m, cx) => { const o = obj(m[1], cx, false); return o && !o.card ? [{ op: 'animAll', who: o.ref, n: +m[2], m: +m[3] }] : null; }],
  [/^(that creature|it) is an? ((?:white|blue|black|red|green) )?([a-z]+) in addition to its other (?:colors and )?types$/, (m, cx) => { const o = obj(m[1], cx, false); const sub = SUB.get(m[3]); return o && sub ? [{ op: 'addType', who: o.ref, kw: [sub], mana: m[2] ? [COLOR_OF[m[2].trim()]] : undefined }] : null; }],
  [/^put (.+?) into its owner's library (second|third) from the top$/, (m, cx) => { const o = obj(m[1], cx, true); return o && !o.card ? [{ op: 'tuck', who: o.ref, dest: 'top', n: m[2] === 'second' ? 1 : 2 }] : null; }],
  [/^§lookone ([a-z ]+)$/, m => { const fp = parseFilter(m[1] + ' card'); return fp ? [{ op: 'look', n: 1, take: 1, f: fp.f, dest: 'hand', rest: 'top', text: m[1] + ' card' }] : null; }],
  [/^§revtop (\w+)\|([^|]+)\|([^|]+)\|([^|]+)$/, m => { const n = num(m[1]); const fp = parseFilter(/\bcards?\b/.test(m[2]) ? m[2] : m[2] + ' card'); if (typeof n !== 'number' || !fp) return null; return [{ op: 'revealTop', n, f: fp.f, dest: m[3].startsWith('onto') ? 'battlefield' : 'hand', tapped: /tapped/.test(m[3]), rest: m[4].startsWith('on the bottom') ? 'bottom' : m[4] === 'into your graveyard' ? 'graveyard' : 'hand', text: m[2] }]; }],
  [/^§revuntil ([a-z ]+)\|([a-z ]+)$/, m => { const fp = parseFilter(m[1] + ' card'); return fp ? [{ op: 'revealUntil', f: fp.f, dest: m[2].startsWith('onto') ? 'battlefield' : 'hand', text: m[1] }] : null; }],
  [/^(.+?) becomes (un)?prepared$/, (m, cx) => { const o = obj(m[1], cx, false); return o && !o.card ? [{ op: 'prep', who: o.ref, n: m[2] ? 0 : 1 }] : null; }],
  [/^§thirst$/, () => [{ op: 'thirst' }]],
  [/^§mobilize (\d+)$/, m => [{ op: 'token', n: +m[1], pl: 'you', tok: { name: 'Warrior', p: 1, t: 1, colors: ['R'], types: ['Creature'], sub: ['Warrior'] }, tapped: true, attacking: true }, { op: 'delaySac', who: 'created' }]],
  [/^§firebend (\w+)$/, (m, cx) => { const n = num(m[1]) ?? amount(m[1], cx); return n === null ? null : [{ op: 'fireMana', n }]; }],
  [/^recruit$/, (_m, cx) => { const tok = clause('create a 1/1 white human soldier creature token', cx); return tok ? [{ op: 'draw', n: 1, pl: 'you' }, { op: 'chosenReset' }, { op: 'discard', n: 1, pl: 'you' }, { op: 'if', cond: { k: 'chosenNonland' }, sub: tok }] : null; }],
  [/^§jobselect$/, () => [{ op: 'token', n: 1, pl: 'you', tok: { name: 'Hero', p: 1, t: 1, colors: [], types: ['Creature'], sub: ['Hero'] } }, { op: 'attach', who: 'self', other: 'created' }]],
  [/^empower jace (.+)$/, (m, cx) => { const n0 = num(m[1]); const n = n0 !== null ? n0 : amount(m[1], cx); return n !== null ? [{ op: 'empower', n, tok: jaceTok() }] : null; }],
  [/^investigate$/, () => [{ op: 'token', n: 1, pl: 'you', tok: { name: 'Clue', colors: [], types: ['Artifact'], preset: 'Clue' } }]],
  [new RegExp(`^(?:${P_RE} )?creates? (${N}|that many|x) (tapped )?(.+?) tokens?(?: with ("[^"]+"|'[^']+'|.+?))?( that are tapped and attacking| that's tapped and attacking| tapped and attacking)?(?: for each (.+))?$`), (m, cx) => {
    const p = pl(m[1], cx, false); const a = num(m[2]) ?? (m[2] === 'that many' && cx.pips ? { pips: cx.pips } : 'ev'); if (!p) return null;
    const cda = !!m[5] && /"~'s power and toughness are each equal to/.test(m[5]); const tok = tokenSpec(m[4]) ?? (cda ? tokenSpec('0/0 ' + m[4]) : null); if (!tok) return null;
    if (m[5]) { const q = /^(?:(.+?),? and )?(?:"([^"]+)"|'([^']+)')$/.exec(m[5]); if (q) { if (q[1]) { const kws = kwList(q[1]); if (!kws) return null; tok.kws = kws; } const ext = tokenAbil(q[2] ?? q[3], tok.name); if (!ext) return null; tok.ext = ext; } else { const kws = kwList(m[5]); if (!kws) return null; tok.kws = kws; } }
    const n = withForEach(a, m[7], cx); if (n === null) return null;
    return [{ op: 'token', n, pl: p, tok, tapped: !!m[3] || !!m[6], attacking: !!m[6] }];
  }],
  [/^create (?:a|one) token that's a copy of (.+?), except it isn't legendary, it's an? ([a-z]+) artifact in addition to its other types, and it has haste$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'copyTok', n: 1, who: o.ref, kind: 'nl', kw: ['haste'], ce: { addTypes: ['Artifact'], addSub: [m[2][0].toUpperCase() + m[2].slice(1)] } }] : null; }],
  [/^create (?:a|one) token that's a copy of (.+?), except the token has ([a-z ,]+) and (?:it|the token) isn't legendary$/, (m, cx) => { const o = obj(m[1], cx, false); const k = kwList(m[2]); return o && k ? [{ op: 'copyTok', n: 1, who: o.ref, kind: 'nl', kw: k }] : null; }],
  [/^create (?:a|one) token that's a copy of (.+?), except (?:it|the token) isn't legendary$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'copyTok', n: 1, who: o.ref, kind: 'nl' }] : null; }],
  [/^create (?:a|one) token that's a copy of (.+?)\. sacrifice (?:it|that token) at the beginning of the next end step$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'copyTok', n: 1, who: o.ref }, { op: 'delaySac', who: 'created' }] : null; }],
  [/^create (?:a|one) token that's a copy of (.+)$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'copyTok', n: 1, who: o.ref }] : null; }],
  [/^(.+?) (?:gains?|gain) (.+?) and (?:gets?|get) ([+-](?:\d+|x))\/([+-](?:\d+|x)) until end of turn$/, (m, cx) => { const k = kwList(m[2]); const o = obj(m[1], cx, false); if (!k || !o) return null; const P = m[3] === '+x' ? 'X' : m[3] === '-x' ? { mul: -1, of: 'X' } : +m[3]; const T = m[4] === '+x' ? 'X' : m[4] === '-x' ? { mul: -1, of: 'X' } : +m[4]; return [{ op: 'grant', who: o.ref, kw: k }, { op: 'pump', who: o.ref, n: P as never, m: T as never }]; }],
  [/^(.+?) (?:each )?(?:gets?|get) ([+-](?:\d+|x))\/([+-](?:\d+|x))(?: and (?:gains?|gain) (.+?))? until end of turn(?: for each (.+))?$/, (m, cx) => pump(m, cx)],
  [/^(.+?) (?:gets?|get) ([+-](?:\d+|x))\/([+-](?:\d+|x)) for each (.+?) until end of turn$/, (m, cx) => pump([m[0], m[1], m[2], m[3], undefined, m[4]] as unknown as RegExpExecArray, cx)],
  [/^until end of turn, (.+?) (?:gets?|get) ([+-](?:\d+|x))\/([+-](?:\d+|x))(?: and (?:gains?|gain) (.+?))?$/, (m, cx) => pump(m, cx)],
  [/^(.+?) (?:gains?|gain) (.+?) until end of turn$/, (m, cx) => { const k = kwList(m[2]); const o = obj(m[1], cx, false); return k && o ? [{ op: 'grant', who: o.ref, kw: k }] : null; }],
  [/^(that token|those tokens|the token|the tokens) gains? (.+?)$/, (m, cx) => { const k = kwList(m[2]); const o = obj(m[1], cx, false); return k && o ? [{ op: 'grant', who: o.ref, kw: k, until: 'perm' }] : null; }],
  [/^until end of turn, (.+?) (?:gains?|gain) (.+?)$/, (m, cx) => { const k = kwList(m[2]); const o = obj(m[1], cx, false); return k && o ? [{ op: 'grant', who: o.ref, kw: k }] : null; }],
  [/^(.+?) can't block this turn$/, (m, cx) => { const o = obj(m[1], cx, true); return o ? [{ op: 'grant', who: o.ref, kw: ['_cantblock'] }] : null; }],
  [/^(.+?) can't be blocked this turn$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'grant', who: o.ref, kw: ['_unblockable'] }] : null; }],
  [/^(.+?) (?:fights|fight) (.+)$/, (m, cx) => { const a = obj(m[1], cx, false); const b = obj(m[2], cx, true); return a && b ? [{ op: 'fight', who: a.ref, other: b.ref }] : null; }],
  [/^add (.+)$/, (m, cx) => { const r = manaAdd(m[1], cx); return r ? [{ op: 'addMana', mana: r.mana as string[], n: r.n ?? 1 }] : null; }],
  [/^goad (.+)$/, (m, cx) => { const o = obj(m[1], cx, true); return o ? [{ op: 'goad', who: o.ref }] : null; }],
  [/^~ deals (\d+) damage to the player or planeswalker that creature is attacking$/, (m) => [{ op: 'damageAtk', n: +m[1], who: 'ev' }]],
  [/^create a number of (.+?) tokens? equal to the amount of excess damage dealt to (?:that creature|it) this way$/, (m, cx) => { const tok = tokenSpec(m[1]); return tok ? [{ op: 'token', n: 'excess', pl: 'you', tok }] : null; }],
  [/^§exilecastif ([^|]+)\|(.+)$/, (m) => { const fp = parseFilter(m[2] + ' card'); const pl = m[1] === 'your' ? 'you' : 'evp'; return fp ? [{ op: 'exileCastIf', f: fp.f, pl, until: 'yourNext' }] : null; }],
  [/^regenerate (.+)$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'regen', who: o.ref }] : null; }],
  [/^(scry|surveil) (\w+)$/, m => { const n = num(m[2]); return n === null ? null : [{ op: m[1], n }]; }],
  [/^§mayshuffle$/, () => [{ op: 'mayShuffle' }]],
  [/^look at the top (\w+) cards of your library, then put them back in any order$/, m => { const n = num(m[1]); return n === null ? null : [{ op: 'reorder', n }]; }],
  [/^it doesn't untap during its controller's next untap step$/, (_m, cx) => [{ op: 'freeze', who: cx.it ?? 't0' }]],
  [/^tap or untap (.+)$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'tapToggle', who: o.ref }] : null; }],
  [/^draw (a|an|one|two|three|\d+) cards? for each (.+)$/, (m, cx) => { const n0 = num(m[1]); const fe = forEach(m[2].replace(/ of that type$/, ' of the chosen type'), cx); return n0 !== null && fe ? [{ op: 'draw', n: n0 === 1 ? fe : { mul: n0, of: fe }, pl: 'you' }] : null; }],
  [/^until end of turn, whenever a player taps an island for mana, that player adds an additional \{u\}$/, () => [{ op: 'highTide' }]],
  [/^§flood (.+)$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'addC', who: o.ref, kind: 'flood', n: 1 }, { op: 'floodIsland', who: o.ref }] : null; }],
  [/^if an ability of an artifact, creature, or planeswalker is countered this way, that permanent loses all abilities for as long as ~ remains on the battlefield$/, () => [{ op: 'silenceSrc' }]],
  [/^copy (?:that spell|it)$/, () => [{ op: 'script', kind: 'copySame' }]],
  [/^(.+?) endures? (\d+)$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'endure', n: +m[2], who: o.ref }] : null; }],
  [/^put your commander into your hand from the command zone$/, () => [{ op: 'cmdrToHand' }]],
  [/^earthbend (\d+)$/, (m, cx) => [{ op: 'earthbend', n: +m[1], who: addSlot(cx, { who: 'perm', f: { ctrl: 'you', types: ['Land'] }, harm: false, opt: false }) }]],
  [new RegExp(`^(?:${P_RE} )?blights? (\\d+)$`), (m, cx) => { const p = pl(m[1], cx); return p ? [{ op: 'blight', n: +m[2], pl: p }] : null; }],
  [/^transform ~$/, () => [{ op: 'transform', who: 'self' }]],
  [/^exile ~, then return (?:it|~) to the battlefield transformed under your control$/, () => [{ op: 'exileRetT', who: 'self' }]],
  [/^after this main phase, there is an additional combat phase followed by an additional main phase$/, () => [{ op: 'extraCombat' }]],
  [/^after this phase, there is an additional combat phase$/, () => [{ op: 'extraCombat' }]],
  [/^after the second main phase this turn, there's an additional combat phase followed by an additional main phase$/, () => [{ op: 'extraCombat', kind: 'afterMain2' }]],
  [/^at the beginning of that combat, untap all creatures that attacked this turn$/, () => [{ op: 'watchCombatUntap' }]],

  [/^monstrosity (\d+)$/, m => [{ op: 'monstrosity', n: +m[1] }]],
  [/^discover (\d+)$/, m => [{ op: 'discover', n: +m[1] }]],
  [/^(.+?) connives?$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'connive', who: o.ref }] : null; }],
  [/^its controller may draw up to two cards at the beginning of the next turn's upkeep$/, () => [{ op: 'arcaneDraws', kind: 'ctl' }]],
  [/^you draw a card at the beginning of the next turn's upkeep$/, () => [{ op: 'arcaneDraws', kind: 'you' }]],
  [/^(.+?) explores?$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'explore', who: o.ref }] : null; }],
  [/^sacrifice (?:it|~)$/, () => [{ op: 'sacThis' }]],
  [/^adapt (\d+)$/, (m) => [{ op: 'script', kind: 'adapt', n: +m[1] }]],
  [/^learn$/, () => [{ op: 'script', kind: 'learn' }]],
  [/^~ deals (\d+) damage to target creature\. if that creature would die this turn, exile it instead$/, (m, cx) => { obj('target creature', cx, true); return [{ op: 'damage', n: +m[1], who: 't0' }, { op: 'script', kind: 'exileIfDies', who: 't0' }]; }],
  [/^~ deals (\d+) damage to any target\. if a creature dealt damage this way would die this turn, exile it instead$/, (m, cx) => { obj('any target', cx, true); return [{ op: 'damage', n: +m[1], who: 't0' }, { op: 'script', kind: 'exileIfDies', who: 't0' }]; }],
  [/^~ deals (\d+) damage to target creature or planeswalker\. if that creature or planeswalker would die this turn, exile it instead$/, (m, cx) => { obj('target creature or planeswalker', cx, true); return [{ op: 'damage', n: +m[1], who: 't0' }, { op: 'script', kind: 'exileIfDies', who: 't0' }]; }],

  [new RegExp(`^(?:${P_RE} )?sacrifices? (${N}|another) (.+)$`), (m, cx) => { const p = pl(m[1], cx); const n = m[2] === 'another' ? 1 : num(m[2]); const fp = parseFilter(m[3]); if (!p || n === null || !fp) return null; if (m[2] === 'another') fp.f.other = true; return [{ op: 'sac', n, pl: p, f: fp.f, text: m[3] }]; }],
  [/^(?:you may )?play an additional land (?:this turn|on each of your turns)$/, () => [{ op: 'extraLand', n: 1 }]],
  [/^put (a|an|up to (?:one|two|three|four|five|six|seven)|any number of) (.+?) cards? from your hand onto the battlefield( tapped)?$/, (m, cx) => { const fp = parseFilter(m[2]); return fp ? [{ op: 'putLand', f: fp.f, n: m[1] === 'any number of' ? 99 : /^up to /.test(m[1]) ? num(m[1].slice(6)) as number : 1, tapped: !!m[3], text: `${m[1]} ${m[2]} card` }] : null; }],
  [/^attach (?:~|it) to (.+)$/, (m, cx) => { const o = obj(m[1], cx, false); return o ? [{ op: 'attach', who: 'self', other: o.ref }] : null; }],
  [/^you may choose new targets for target spell or ability$/, (m, cx) => { const o = obj('target spell or ability', cx, true); return o ? [{ op: 'retarget', who: o.ref }] : null; }],
  [/^choose new targets for target spell or ability$/, (m, cx) => { const o = obj('target spell or ability', cx, true); return o ? [{ op: 'retarget', who: o.ref }] : null; }],
  [/^change the target of target spell or ability with a single target$/, (m, cx) => { const o = obj('target spell or ability', cx, true); if (o && cx.slots.length) (cx.slots[cx.slots.length - 1] as { single?: boolean }).single = true; return o ? [{ op: 'retarget', who: o.ref }] : null; }],
  [/^one or two target creatures can't block this turn$/, (m, cx) => { const o1 = obj('target creature', cx, true); const o2 = obj('target creature', cx, true); if (!o1 || !o2) return null; cx.slots[cx.slots.length - 1].opt = true; return [{ op: 'grant', who: o1.ref, kw: ['_cantblock'] }, { op: 'grant', who: o2.ref, kw: ['_cantblock'] }]; }],
  [/^you and permanents you control gain (.+) until end of turn$/, (m, cx) => { const k = kwList(m[1]); return k ? [{ op: 'grant', who: 'you', kw: k }, { op: 'grant', who: 'yours', kw: k }] : null; }],
  [/^permanents you control also gain (.+) until end of turn$/, (m, cx) => { const k = kwList(m[1]); return k ? [{ op: 'grant', who: 'yours', kw: k }] : null; }],
  [/^creatures your opponents control attack this turn if able$/, () => [{ op: 'grant', who: { all: { types: ['Creature'], ctrl: 'opp' } }, kw: ['_mustattack'] }]],
  [/^target creature you control gains protection from the color(?: of your choice)? until end of turn$/, (_m, cx) => [{ op: 'protChoice', who: addSlot(cx, { who: 'perm', f: { types: ['Creature'], ctrl: 'you' }, harm: false }) }]],

  [/^you gain protection from everything until your next turn$/, () => [{ op: 'protAll', until: 'yourNext' }]],
  [/^each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way$/, () => [{ op: 'windfall' }]],
  [/^create a food token or a treasure token$/, () => [{ op: 'tokenOr', tok: { name: 'Food', colors: [], types: ['Artifact'], preset: 'Food' }, text: 'Treasure' }]],
  [/^you may exile a nonartifact nonland card from your hand$/, () => [{ op: 'may', text: 'exile a nonartifact, nonland card from your hand', sub: [{ op: 'exile', zone: 'hand', f: { notTypes: ['Artifact', 'Land'] }, n: 1 }] }]],
  [/^exile a nonartifact nonland card from your hand$/, () => [{ op: 'exile', zone: 'hand', f: { notTypes: ['Artifact', 'Land'] }, n: 1 }]],
  [/^mill (two|three|four|five|six|seven|eight|nine|ten|\d+) cards?, then return a (.+?) card from your graveyard to your hand$/, (m) => { const n = num(m[1]); const fp = parseFilter(m[2] + ' card'); return typeof n === 'number' && fp ? [{ op: 'mill', n, pl: 'you' }, { op: 'retPick', n: 1, f: fp.f, dest: 'hand', zone: 'graveyard' }] : null; }],
  [/^search your library for an artifact card with mana cost \{0\} or \{1\}, put it onto the battlefield, then shuffle$/, () => [{ op: 'search', n: 1, f: { types: ['Artifact'], cost01: true }, dest: 'battlefield', text: 'artifact card with mana cost {0} or {1}' }]],
  [/^that player may search their library for a land card with a basic land type, put it onto the battlefield, then shuffle$/, () => [{ op: 'maySearch', pl: 'ctl:t0', f: { types: ['Land'], basicType: true }, dest: 'battlefield', text: 'land card with a basic land type' }]],
  [/^~ gains "([^"]+)"$/, (m) => { const ext = tokenAbil(m[1], CUR_NAME); return ext ? [{ op: 'gainAbil', who: 'self', ce: { grant: ext } }] : null; }],
  [/^(?:until end of turn, )?(that creature|it|~) gains "when ~ dies, return it to the battlefield tapped under its owner's control\."(?: until end of turn)?$/, (m, cx) => { const o = obj(m[1], cx, false); const ext = tokenAbil("when ~ dies, return it to the battlefield tapped under its owner's control", CUR_NAME); return o && ext ? [{ op: 'gainAbil', who: o.ref, ce: { grant: ext }, until: 'eot' }] : null; }],
  [/^exile the top card of your library$/, () => [{ op: 'exileTop', n: 1 }]],
  [/^for each color among permanents you control, add one mana of that color$/, () => [{ op: 'addMana', mana: ['EACH_COLOR'] }]],
  [/^§devotionmana$/, () => [{ op: 'addMana', mana: ['CHOSEN'], n: { devotion: [] } }]],
  [/^choose a color\. add an amount of mana of that color equal to your devotion to that color$/, () => [{ op: 'addMana', mana: ['CHOSEN'], n: { devotion: [] } }]],
  [/^return the chosen cards to the battlefield tapped$/, (m, cx) => [{ op: 'ret', who: (cx.slots.length >= 2 ? `tr:0-${cx.slots.length - 1}` : (cx.it ?? 't0')) as import('./types').Ref, dest: 'battlefield', zone: 'graveyard', tapped: true }]],
  [/^search your library for (a|an|one|two|three|any number of|up to (?:one|two|three|four|five|x)) (.+?) cards?(?: with (?:different names|the same name))?, (?:reveal (?:it|them|that card|those cards), )?(?:and )?put (?:it|them|that card|those cards|the card) (onto the battlefield( tapped)?|into your hand|into your graveyard|on top of your library)(?:,? then shuffle| and shuffle)?$/, (m, cx) => search(m[1], m[2], m[3], !!m[4])],
  [/^search your library for (a|an|one) card,? (?:then )?(?:reveal it, )?(?:then )?(?:shuffle(?: and|,)? )?(?:put|and put) (?:that card|it) (into your hand|into your graveyard|on top(?: of your library)?)(?:,? then shuffle)?$/, m => search(m[1], 'card', m[2].startsWith('on top') ? 'on top of your library' : m[2], false)],
  [/^search your library for a card, put that card into your graveyard, then shuffle$/, () => search('a', 'card', 'into your graveyard', false)],
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
  return [{ op: 'search', n, f: fp.f, dest: dest.startsWith('onto') ? 'battlefield' : dest.startsWith('on top') ? 'top' : dest.includes('graveyard') ? 'graveyard' : 'hand', tapped, text: noun === 'card' ? 'card' : / with /.test(noun) ? noun.replace(' with ', ' card with ').replace(/\bx\b/, 'X') : `${noun} card` }];
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

const IFDID_OPS = new Set(['sac', 'sacThis', 'sacUid', 'discard', 'mill', 'search', 'destroy', 'exile', 'draw', 'lose', 'blight', 'ret', 'putLand']);
function canDetectIfDid(fx: Effect[]): boolean {
  return fx.length > 0 && fx.every(e => IFDID_OPS.has(e.op) || (e.op === 'may' && canDetectIfDid(e.sub ?? [])));
}

function clause(s: string, cx: Cx): Effect[] | null {
  s = s.trim().replace(/^then /, '').replace(/\.$/, '').replace(/\beach of (up to \w+|\w+) target\b/, '$1 target')
    .replace(/ (tokens?) named ([a-z'-]+(?: [a-z'-]+){0,3}?)(?= with |$| that )/, (_, t, nm) => ` named:${nm.replace(/ /g, '_')} ${t}`);
  { const ta = /^(create (?:a|an|one|two|three|four|five|six|x|\d+) )tapped and attacking (.+)$/.exec(s);
    if (ta) { s = / for each /.test(ta[2]) ? ta[1] + ta[2].replace(/ for each /, " that's tapped and attacking for each ") : ta[1] + ta[2] + " that's tapped and attacking"; } }
  if (!s) return [];
  let m: RegExpExecArray | null;
  if ((m = /^if (.+?), (.+)$/.exec(s))) { const c = cond(m[1], cx); const sub = c && clause(m[2], cx); if (c && sub) return [{ op: 'if', cond: c, sub }]; }
  if ((m = /^for each ([^,]+), (.+)$/.exec(s)) && !/ for each /.test(m[2])) { const save = cx.slots.length; const r = clause(`${m[2]} for each ${m[1]}`, cx); if (r) return r; cx.slots.length = save; }
  if ((m = /^(.+?) §gainlost$/.exec(s))) { const a = clause(m[1], cx); return a ? [...a, { op: 'gain', n: { lostWay: true }, pl: 'you' }] : null; }
  if ((m = /^(.+?) §ifdid (.+)$/.exec(s))) { const a = clause(m[1], cx); const b = a && clause(m[2], cx); return a && b && canDetectIfDid(a) ? [{ op: 'ifDid', sub: a, else: b }] : null; }
  if ((m = /^you may pay (\{[^}]+\}(?:\{[^}]+\})*) §ifdo (.+)$/.exec(s))) { const c = parseCost(m[1].toUpperCase()); const sub = c && clause(m[2], cx); return c && sub ? [{ op: 'may', text: `pay ${m[1].toUpperCase()} to ${m[2]}`, ifPaid: c, sub }] : null; }
  if ((m = /^you may (.+?) §ifdo (.+)$/.exec(s))) { const a = clause(m[1], cx); const b = a && clause(m[2], cx); return a && b ? [{ op: 'may', text: m[1], sub: [...a, ...b] }] : null; }
  if ((m = /^(.+), where x is (.+)$/.exec(s))) { const a = amount(m[2], cx); if (a !== null) cx.xAmt = a; const sub = a !== null && clause(m[1], cx); if (sub) { const fix = (e: Effect) => { for (const k of ['n', 'm'] as const) if (e[k] === 'X') e[k] = a!; e.sub?.forEach(fix); }; sub.forEach(fix); return sub; } }
  if ((m = /^you may (.+)$/.exec(s)) && !/^you may play an additional land/.test(s)) { const sub = clause(m[1], cx); if (sub) return [{ op: 'may', text: m[1], sub }]; return null; }
  if ((m = new RegExp(`^${P_RE} may (.+)$`).exec(s))) { const p = playerRef(m[1], cx); const sub = clause(m[2].replace(/their library/g, 'your library'), { ...cx, lastPl: p ?? undefined }); if (p && sub) { for (const e of sub) if (e.pl === 'you' || (e.op === 'search' && !e.pl)) e.pl = p; return [{ op: 'may', pl: p, text: m[2], sub }]; } }
  if ((m = /^(sacrifice (?:it|~)) unless you pay (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(s))) { const c = parseCost(m[2].toUpperCase()); const sub = c && clause(m[1], cx); return c && sub ? [{ op: 'unless', pl: 'you', ifPaid: c, text: m[1], sub }] : null; }
  if ((m = /^(sacrifice (?:it|~)|exile (?:it|~)) unless you (.+)$/.exec(s))) { const sub = clause(m[1], cx); const alt = sub && clause(m[2], cx); if (sub && alt && canDetectIfDid(alt)) return [{ op: 'unlessAct', pl: 'you', sub, else: alt, text: m[1] }]; }
  if ((m = /^(.+?) unless (.+)$/.exec(s)) && !/^you /.test(m[2]) && !/pays? \{/.test(m[2]) && !/unless they're mana abilities/.test(s) && !/for each/.test(s)) { const cc = cond(m[2], cx); const sub = cc && clause(m[1], cx); if (cc && sub) return [{ op: 'if', cond: { k: 'not', c: cc }, sub }]; }
  if (/^if that creature would die this turn, exile it instead$/.test(s)) return [{ op: 'script', kind: 'exileIfDies', who: 't0' }];
  if ((m = /^(.+?) unless (that player|its controller|they|he or she|any player) pays? \{(\d+)\}$/.exec(s))) { const sub = clause(m[1], cx); const ft = sub?.find(e => typeof e.who === 'string' && /^t\d+$/.test(e.who as string))?.who as string | undefined; const p = m[2] === 'any player' ? null : m[2] === 'its controller' && ft ? `ctl:${ft}` : playerRef(m[2] === 'they' || m[2] === 'he or she' ? 'that player' : m[2], cx, true); if (sub && p) return [{ op: 'unless', pl: p, ifPaid: { generic: +m[3] }, text: m[1], sub }]; }
  if ((m = /^(.+?) unless (that player|its controller|they|he or she) pays? \{x\}, where x is ~'s power$/.exec(s))) { const sub = clause(m[1], cx); const p = playerRef(m[2] === 'they' || m[2] === 'he or she' ? 'that player' : m[2], cx, true); if (sub && p) return [{ op: 'unless', pl: p, n: { pow: 'self' }, text: m[1], sub }]; }
  if ((m = /^destroy (.+?) unless (?:its controller|that player|they) has ~ deal damage to (?:them|that player|him or her|its controller) equal to (?:his|her|its|~'s) power$/.exec(s))) { const o = obj(m[1], cx, true); return o && !o.card ? [{ op: 'unlessDmg', who: o.ref, n: { pow: 'self' } }] : null; }
  if ((m = /^(that player|they|each opponent) may pay \{(\d+)\}\. if (?:the player|they|that player) (?:doesn't|don't|do not|does not), (.+)$/.exec(s))) { const sub = clause(m[3], cx); const p = playerRef(m[1] === 'they' ? 'that player' : m[1], cx, true); if (sub && p) return [{ op: 'unless', pl: p, ifPaid: { generic: +m[2] }, text: m[3], sub }]; }
  for (const [re, fn] of PATS) { const mm = re.exec(s); if (mm) { const save = cx.slots.length; const r = fn(mm, cx); if (r) return r; cx.slots.length = save; } }
  // split compound clauses: "X and Y", "X, then Y", "X, Y, and Z"
  const seps = [/, then /g, /\. then /g, / and then /g, /, and /g, / and /g, /, /g];
  for (const sep of seps) {
    const idx = [...s.matchAll(sep)].map(x => [x.index!, x[0].length] as const);
    for (const [i, len] of idx) {
      const save = cx.slots.length; const a = clause(s.slice(0, i), cx); if (!a) { cx.slots.length = save; continue; }
      let right = s.slice(i + len);
      if (/^(draws?|loses?|gains?|discards?|mills?|creates?|scry|surveil|sacrifices?)\b/.test(right) && a[0]?.pl && a[0].pl !== 'you' && /^(loses?|gains?|discards?|draws?)/.test(right)) { const who = a[0].pl === 'opps' ? 'each opponent' : a[0].pl === 'all' ? 'each player' : /^t\d+$/.test(String(a[0].pl)) ? 'that player' : 'you'; right = `${who} ${right}`; }
      const b = clause(right, cx); if (b) return [...a, ...b]; cx.slots.length = save;
    }
  }
  return null;
}
/** Parse a block of effect sentences. */
export function effects(text: string, cx: Cx): Effect[] | null {
  let t = text.trim().replace(/\.$/, '').replace(/draw three cards\. then discard two cards unless you discard an artifact card/, 'draw three cards. §thirst').replace(/\bnoncreature, nonland\b/g, 'noncreature nonland').replace(/\bnonartifact, nonland\b/g, 'nonartifact nonland').replace(/^choose ((?:two |three )?target )/, '$1').replace(/choose a color\. add an amount of mana of that color equal to your devotion to that color/, '§devotionmana').replace(/(search your library for (?:a|an) [a-z ]+?) card (with mana value (?:x|\d+) or less),/, '$1 $2 card,');
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
  const imp = /^(.*?)exile the top (card|\w+ cards) of your library(?:, where x is ([^.]+))?\. (?:until (?:the )?end of (?:your next )?turn, )?you may play (?:it|that card|them|those cards)(?: this turn| until the end of your next turn| until end of turn)?(.*)$/.exec(t);
  if (imp) { if (imp[3]) { const a = amount(imp[3], cx); if (a !== null) cx.xAmt = a; } const pre = imp[1] ? effects(imp[1], cx) : []; let k: Amt | null = imp[2] === 'card' ? 1 : num(imp[2].split(' ')[0]); if (k === 'X' && cx.xAmt) k = cx.xAmt; const post = (imp[4] ?? '').replace(/^\.\s*/, ''); const tail = post ? effects(post, cx) : []; if (!pre || !tail || k === null) return null; return [...pre, { op: 'exileTop', n: k, until: /next turn/.test(imp[0]) ? 'yourNext' : 'eot' }, ...tail]; }
  { const mdn = /^(.*?)at the beginning of your next main phase, add an amount of \{c\} equal to that spell's mana value$/.exec(t);
    if (mdn) { const pre = mdn[1] ? effects(mdn[1].replace(/\.\s*$/, ''), cx) : []; if (!pre) return null; return [...pre, { op: 'delayMain', sub: [{ op: 'addMana', mana: ['C'], n: { mv: 't0' } }] }]; } }
  { const onlyT = /^((?:two |three )?target [^.]+)\. (.+)$/s.exec(t); if (onlyT) { const o = obj(onlyT[1], cx, true); if (o && !/ (gets?|gains?|deals?|is|are|can't|doesn't|becomes|enters) /.test(onlyT[1])) { cx.it = o.ref as string; cx.that = o.ref as string; t = onlyT[2]; } } }
  t = t.replace(/(you|target opponent|target player|each opponent) gets? an emblem with "([^"]+)"/g, (_, w: string, b: string) => { EMB.push(b.replace(/\.$/, '')); return `${w} gets emblem#${EMB.length - 1}${/\.$/.test(b) ? '.' : ''}`; })
    .replace(/that's still a planeswalker\. prevent all damage that would be dealt to (?:him|her|it|them) this turn/, "that's still a planeswalker §prevent");
  t = t.replace(/(that player|they) may pay \{(\d+)\}\. if (?:the player|they|that player) (?:doesn't|don't|does not|do not), ([^.]+)/g, '$3 unless $1 pays {$2}')
    .replace(/(you may [^.]+)\. if you do, /g, '$1 §ifdo ')
    .replace(/([^.]+)\. if you do, /g, '$1 §ifdid ')
    .replace(/\. you gain life equal to the life lost this way/, ' §gainlost')
    .replace(/look at the top card of (target player's|target opponent's) library\. you may put that card on the bottom of that player's library/, (_, p: string) => `§looktb ${p.replace(/'s$/, '')}`)
    .replace(/separate all permanents (target player|target opponent) controls into two piles\. /, 'separate all permanents $1 controls into two piles§ ')
    .replace(/look at the top card of your library\. if it's an? ([a-z ]+?) card( of the chosen type)?, you may reveal it and put it into your hand/, '§lookone $1$2')
    .replace(/^choose a creature type(?=\. .*(?:aren't|isn't) of the chosen type)/, 'choose a creature type §keep')
    .replace(/reveal the top (\w+) cards of your library\. put all ([a-z0-9+/ -]+?) (?:cards )?(?:revealed this way|from among them) (into your hand|onto the battlefield(?: tapped)?) and the rest (on the bottom of your library(?: in any order| in a random order)?|into your graveyard|into your hand)/, '§revtop $1|$2|$3|$4')
    .replace(/reveal cards from the top of your library until you reveal an? ([a-z ]+?) card\. put (?:that|the revealed) card (into your hand|onto the battlefield) and the rest on the bottom of your library in a random order/, '§revuntil $1|$2')
    .replace(/put a flood counter on (.+?)\. (?:that land|it)(?:'s| is) an island in addition to its other types for as long as it has a flood counter on it/g, '§flood $1')
    .replace(/exile the top card of (your|that player's|their) library\. if it's an? ([^.]+?) card, you may cast (?:that card|it) until the end of your next turn/, '§exilecastif $1|$2')
    .replace(/look at the top (\w+) cards of your library, then put them back in any order\. you may shuffle/g, 'look at the top $1 cards of your library, then put them back in any order. §mayshuffle');
  t = t.replace(
    /(target (?:player|opponent)) reveals (?:their|his or her) hand\. you choose (?:a|an) ([^.]+?) from it\. (?:that (?:player|opponent)|they) discards that card/g,
    '§seize $1|$2|graveyard')
    .replace(
    /(target (?:player|opponent)) reveals (?:their|his or her) hand\. you choose (?:a|an) ([^.]+?) from it and exile that card/g,
    '§seize $1|$2|exile')
    .replace(
    /(target (?:player|opponent)) reveals (?:their|his or her) hand\. you choose (?:a|an) ([^.]+?) from it or (?:a card|an? [^.]+?) from (?:their|his or her) graveyard\. exile that card/g,
    '§seize $1|$2|exile+gy')
    .replace(/, then investigate(?=\.|$)/g, '. investigate')
    .replace(/ and investigate(?=\.|$)/g, '. investigate');
  t = t.replace(/\."(\s+)/g, '".$1');
  // CR 732 / The Celestus: collapse the common toggle into one effect (also scored by the AI).
  t = t.replace(/at the beginning of your next upkeep, pay ((?:\{[^}]+\})+)\. if you don't, you lose the game/, '§pact $1');
  if (/^if it's night, it becomes day\. otherwise, it becomes night$/.test(t)) return [{ op: 'toggleDayNight' }];
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
    if (/^a creature destroyed this way can't be regenerated$/.test(s.replace(/\.$/, ''))) { if (out.length && out[out.length - 1].op === 'destroy') out[out.length - 1].kind = 'noRegen'; continue; }
    if (/^if that spell is countered this way, exile it instead of putting it into its owner's graveyard$/.test(s.replace(/\.$/, ''))) { if (out.length && out[out.length - 1].op === 'counter') out[out.length - 1].dest = 'exile'; continue; }
    if (/^it's an enchantment$/.test(s.replace(/\.$/, ''))) { const prev = out[out.length - 1]; if (prev && (prev.op === 'ret' || prev.op === 'retAsEnch')) { out[out.length - 1] = { op: 'retAsEnch', who: prev.who ?? 'self' }; continue; } out.push({ op: 'retAsEnch', who: 'self' }); continue; }

    if (/^you may choose new targets for the cop(?:y|ies)$/.test(s.replace(/\.$/, ''))) continue;
    const sacNext = /^sacrifice (?:it|that token) at the beginning of the next end step$/.exec(s.replace(/\.$/, ''));
    if (sacNext && out.length && out[out.length - 1].op === 'copyTok') { out.push({ op: 'delaySac', who: 'created' }); continue; }
    const twoInstead = /^if (?:the creature|it|that creature) had power (\d+) or greater, create two of those tokens instead$/.exec(s.replace(/\.$/, ''));
    if (twoInstead && out.length && out[out.length - 1].op === 'token') { out.push({ op: 'if', cond: { k: 'evPowGE', n: +twoInstead[1] }, sub: [{ ...out[out.length - 1], n: 1 }] }); continue; }
    const hasteAtk = /^(?:that token|those tokens|it) gains? haste until end of turn and attacks? this (?:combat|turn) if able$/.exec(s.replace(/\.$/, ''));
    if (hasteAtk && out.length && out[out.length - 1].op === 'token') { out.push({ op: 'grant', who: 'created', kw: ['haste', '_mustattack'] }); continue; }
    if (/^if (?:that creature|that creature or planeswalker|a creature dealt damage this way) would die this turn, exile (?:it|that creature|that creature or planeswalker) instead$/.test(s.replace(/\.$/, '')) && out.length) { out.push({ op: 'script', kind: 'exileIfDies', who: 't0' }); continue; }
    if (/^if a creature would die this turn, exile it instead$/.test(s.replace(/\.$/, '')) && out.length) { out.push({ op: 'tempRepl', repl: { ev: 'die', f: { types: ['Creature'] }, thisTurn: true, until: 'eot', zoneChange: true, instead: { k: 'exile' }, text: s } }); continue; }
    if (/^if a card would be put into your graveyard from anywhere this turn, exile that card instead$/.test(s.replace(/\.$/, '')) && out.length) { out.push({ op: 'tempRepl', repl: { ev: 'toGy', fromAnywhere: true, pl: 'you', cardsOnly: true, until: 'eot', zoneChange: true, instead: { k: 'exile' }, text: s } }); continue; }
    const ins = /^if (.+?), (.+) instead$/.exec(s.replace(/\.$/, ''));
    if (ins && out.length) { const c = cond(ins[1], cx); const sub = c && clause(ins[2], cx); if (!c || !sub) return null; const prev = out.pop()!; out.push({ op: 'if', cond: c, sub, else: [prev] }); continue; }
    const oth = /^otherwise, (.+)$/.exec(s.replace(/\.$/, ''));
    if (oth && out.length && out[out.length - 1].op === 'if') {
      const els = clause(oth[1], cx); if (!els) return null; out[out.length - 1].else = els; continue;
    }
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
export function parseCosts(s: string, name: string): ParsedCost | null {
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
    else if ((m = /^pay ((\{[^}]+\})+)$/i.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return null; ab.mana = ab.mana ? { ...ab.mana, ...c, generic: (ab.mana.generic ?? 0) + (c.generic ?? 0), E: (ab.mana.E ?? 0) + (c.E ?? 0) } : c; }
    else if ((m = /^pay (one|two|three|four|five|six|seven|eight|nine|ten|\d+) \{e\}$/i.exec(p))) { const n = ({ one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10 } as Record<string, number>)[m[1]] ?? +m[1]; if (!n) return null; ab.mana = { ...(ab.mana ?? { generic: 0 }), E: (ab.mana?.E ?? 0) + n }; }
    else if ((m = /^pay (\d+) life$/.exec(p))) ab.life = +m[1];
    else if ((m = /^remove (a|an|one|two|three|\d+) ([+-]\d\/[+-]\d|[a-z]+) counters? from ~$/.exec(p))) ab.remC = { kind: m[2], n: num(m[1]) as number };
    else if ((m = /^put (a|an|one|two) ([+-]\d\/[+-]\d|[a-z]+) counters? on ~$/.exec(p))) ab.addC = { kind: m[2], n: num(m[1]) as number };
    else if (p === 'exile ~ from your graveyard') { ab.zone = 'graveyard'; ab.exileGy = { n: 1, self: true }; }
    else if ((m = /^exile (a|an|one|two|three|\d+) (.*?) ?cards? from your graveyard$/.exec(p))) { const fp = m[2] ? parseFilter(m[2] + ' card') : { f: {} }; if (!fp) return null; ab.exileGy = { f: fp.f, n: num(m[1]) as number }; }
    else if ((m = /^tap (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) untapped (.+?) you control$/.exec(p))) { const fp = parseFilter(m[2]); if (!fp) return null; const n = num(m[1]); if (typeof n !== 'number') return null; ab.tapF = { f: fp.f, n }; }
    else if (p === 'exile ~') ab.exileSelf = true;
    else if (/^exile (?:this card|~) from your hand$/.test(p)) { ab.zone = 'hand'; ab.exileSelf = true; }
    else if (/^exert (?:~|this land|this artifact|this creature)$/.test(p)) ab.exert = true;
    else if ((m = /^waterbend \{(\d+)\}$/.exec(p))) { ab.mana = { generic: +m[1] }; ab.wb = +m[1]; }
    else return null;
  }
  void name; return { ab };
}
export function cleanLine(l: string): string { return l.replace(/^[a-z' ,-]+ — /, s => (/^(choose|when|whenever|at)\b/.test(s) ? s : '')); }

export interface CompileResult { unparsed: string[]; notes: string[]; ok: boolean }
export interface ScryLike { name: string; oracle_text?: string; type_line?: string; mana_cost?: string; power?: string; toughness?: string; loyalty?: string; keywords?: string[]; oracle_id?: string }

export function normalize(text: string, name: string): string {
  let t = text.replace(/\([^)]*\)/g, '');
  const short = name.split(',')[0].split(' of ')[0];
  t = t.split(name).join('~');
  if (short.length > 3 && short !== name) t = t.replace(new RegExp(`\\b${short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), '~');
  for (const sh of [name.split(',')[0].split(' and ')[0], name.split(',')[0].split(' the ')[0]]) if (sh.length > 3 && sh !== name && sh !== short) t = t.replace(new RegExp(`\\b${sh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b(?!['’]s? [A-Z])`, 'g'), '~');
  t = t.toLowerCase().replace(/[’‘]/g, "'").replace(/[−–]/g, '-').replace(/\." it's still an? (land|artifact)/g, '" that\'s still a $1').replace(/\b(this (creature|artifact|enchantment|land|permanent|spell|card|equipment|aura|vehicle|planeswalker|token|spacecraft|planet|class|saga|mount|room|siege|battle))\b/g, '~');
  // MSC-style personal pronouns for the card itself
  t = t.replace(/\b(?:he|she) (gains|gets|deals|has|can't|enters|attacks|blocks|dies|was|is|connives|explores)\b/g, '~ $1').replace(/\b(on|exile|sacrifice|untap|tap|return) (him|her)\b(?! own)/g, '$1 ~').replace(/\b(his|her) (power|toughness)\b/g, "~'s $2");
  t = t.replace(/ of (?:their|his or her|your) choice/g, '').replace(/enters the battlefield/g, 'enters').replace(/enters under your control/g, 'enters under your control').replace(/ +/g, ' ').replace(/ \./g, '.');
  return t;
}

export function trigger(head: string): { defs: Partial<TriggerDef>[]; cx: Partial<Cx> } | null {
  let m: RegExpExecArray | null; const h = head.trim().replace(/ under your control$/, ' you control').replace(/^~ deal /, '~ deals ').replace(/\bnon-?creature, non-?land\b/g, 'noncreature nonland');
  if ((m = /^(an? |another |one or more )(.+?) enters or attacks$/.exec(h))) { const a = trigger(`${m[1]}${m[2]} enters`); const b = trigger(`${m[1]}${m[2]} attacks`); if (a && b) return { defs: [...a.defs, ...b.defs], cx: a.cx }; }
  const self = (ev: string, extra: Partial<TriggerDef> = {}) => ({ defs: [{ ev, subj: 'self' as const, ...extra }], cx: { it: 'self' } });
  if (/^~ enters untapped$/.test(h)) return { defs: [{ ev: 'etb', subj: 'self', ifc: { k: 'enteredUntapped' } }], cx: { it: 'self' } };
  if (/^~ enters$/.test(h)) return self('etb');
  if (/^~ or another land you control enters$/.test(h)) return { defs: [{ ev: 'etb', subj: 'any', f: { types: ['Land'], ctrl: 'you' } }], cx: { it: 'ev' } };
  if (/^~ enters or attacks$|^~ attacks or enters$/.test(h)) return { defs: [{ ev: 'etb', subj: 'self' }, { ev: 'attacks', subj: 'self' }], cx: { it: 'self' } };
  if ((m = /^~ enters and whenever (.+)$/.exec(h))) { const a = trigger('~ enters'); const b = trigger(m[1]); if (a && b) return { defs: [...a.defs, ...b.defs], cx: a.cx }; }
  if (/^~ dies$|^~ is put into a graveyard from the battlefield$/.test(h)) return self('dies');
  if (/^~ enters or dies$/.test(h)) return { defs: [{ ev: 'etb', subj: 'self' }, { ev: 'dies', subj: 'self' }], cx: { it: 'self' } };
  if (/^~ leaves the battlefield$/.test(h)) return self('ltb');
  if (/^you cycle ~$/.test(h)) return self('cycled');
  if (/^~ attacks$/.test(h)) return { ...self('attacks'), cx: { it: 'self', thatPl: 'def' } };
  if (/^~ blocks$/.test(h)) return self('blocks');
  if (/^~ attacks or blocks$/.test(h)) return { defs: [{ ev: 'attacks', subj: 'self' }, { ev: 'blocks', subj: 'self' }], cx: { it: 'self' } };
  if (/^~ becomes blocked$/.test(h)) return self('blocked');
  if (/^~ blocks or becomes blocked$/.test(h)) return { defs: [{ ev: 'blocks', subj: 'self' }, { ev: 'blocked', subj: 'self' }], cx: { it: 'self' } };
  if (/^~ deals damage$/.test(h)) return { defs: [{ ev: 'dealtDmgBy', subj: 'self' }], cx: { it: 'self' } };
  if (/^~ deals combat damage to a player$/.test(h)) return { ...self('combatDamagePlayer'), cx: { it: 'self', thatPl: 'evp' } };
  if (/^~ deals combat damage to an opponent$/.test(h)) return { defs: [{ ev: 'combatDamagePlayer', subj: 'self', pl: 'notyou' }], cx: { it: 'self', thatPl: 'evp' } };
  if (/^~ deals combat damage to a creature$/.test(h)) return { defs: [{ ev: 'combatDamageCreature', subj: 'self' }], cx: { it: 'self', that: 'ev' } };
  if (/^~ deals damage to (a player|an opponent)$/.test(h)) return { defs: [{ ev: 'damagePlayer', subj: 'self' }], cx: { it: 'self', thatPl: 'evp' } };
  if (/^~ is dealt damage$/.test(h)) return self('dealtDamage');
  if (/^~ becomes untapped$/.test(h)) return self('untaps');
  if (/^~ and at least two other creatures attack$/.test(h)) return { defs: [{ ev: 'attacks', subj: 'self', ifc: { k: 'battalion' } }], cx: { it: 'self', thatPl: 'def' } };
  if (/^you cast a spell that targets ~$/.test(h)) return { defs: [{ ev: 'targeted', subj: 'self', ifc: { k: 'evSpellYou' } }], cx: { it: 'self', that: 'ev' } };
  if (/^~ becomes the target of a spell you control$/.test(h)) return { defs: [{ ev: 'targeted', subj: 'self', ifc: { k: 'evSpellYou' } }], cx: { it: 'self', that: 'ev' } };
  if (/^~ becomes the target of a spell or ability you control$/.test(h)) return { defs: [{ ev: 'targeted', subj: 'self', ifc: { k: 'evByYou' } }], cx: { it: 'self', that: 'ev' } };
  if (/^~ becomes the target of a spell or ability$/.test(h)) return { defs: [{ ev: 'targeted', subj: 'self' }], cx: { it: 'self', that: 'ev' } };
  if (/^~ deals combat damage to a player or planeswalker$/.test(h) || /^~ deals combat damage to any target$/.test(h)) return { ...self('combatDamagePlayer'), cx: { it: 'self', thatPl: 'evp' } };
  if ((m = /^(equipped|enchanted) creature (dies|attacks|deals combat damage to a player|deals damage)$/.exec(h))) return { defs: [{ ev: m[2] === 'dies' ? 'dies' : m[2] === 'attacks' ? 'attacks' : m[2] === 'deals damage' ? 'damagePlayer' : 'combatDamagePlayer', subj: 'attached' }], cx: { it: 'attached', that: 'ev', thatPl: 'evp' } };
  if (/^a creature dealt damage by ~ this turn dies$/.test(h))
    return { defs: [{ ev: 'dies', subj: 'any', f: { types: ['Creature'] }, ifc: { k: 'srcDamagedEv' } }], cx: { it: 'ev', that: 'ev' } };
  if ((m = /^(?:(a|an|another|one or more|one or more other)|~ or (another|an?)) (.+?) (enters|dies|attacks|blocks|deals combat damage to a player|deals combat damage to an opponent|leaves the battlefield|is put into a graveyard from the battlefield|enter|die|attack)$/.exec(h))) {
    const fp = parseFilter(m[3]); if (!fp || fp.card || fp.spell) return null;
    const other = m[1] === 'another' || m[1] === 'one or more other'; if (other) fp.f.other = true;
    const ev = { enters: 'etb', enter: 'etb', dies: 'dies', die: 'dies', 'is put into a graveyard from the battlefield': 'dies', attacks: 'attacks', attack: 'attacks', blocks: 'blocks', 'deals combat damage to a player': 'combatDamagePlayer', 'deals combat damage to an opponent': 'combatDamagePlayer', 'leaves the battlefield': 'ltb' }[m[4]]!;
    return { defs: [{ ev, subj: other ? 'other' : 'any', f: fp.f }], cx: { it: 'ev', that: 'ev', thatPl: ev === 'combatDamagePlayer' ? 'evp' : 'ctl:ev' } };
  }
  if ((m = /^(a|an|one or more) (.+?) attacks? you(?: or a planeswalker you control)?$/.exec(h))) { const fp = parseFilter(m[2]); return fp ? { defs: [{ ev: 'attacks', subj: 'any', f: fp.f, pl: 'you' }], cx: { it: 'ev', that: 'ev', thatPl: 'ctl:ev' } } : null; }
  if ((m = /^you cast an? (noncreature )?spell with one or more (white|blue|black|red|green) mana symbols in its mana cost$/.exec(h))) { const col = COLOR_OF[m[2]]; const f: Filter = { pip: col }; if (m[1]) f.notTypes = ['Creature']; return { defs: [{ ev: 'cast', subj: 'any', f, pl: 'you' }], cx: { it: 'ev', that: 'ev', pips: col } }; }
  if (/^you cast a spell of the chosen type$/.test(h)) return { defs: [{ ev: 'cast', subj: 'any', f: { chosenType: true }, pl: 'you' }], cx: { it: 'ev', that: 'ev' } };
  if (/^a spell or ability you control counters a spell$/.test(h)) return { defs: [{ ev: 'counters', pl: 'you' }], cx: { it: 'self' } };
  if ((m = /^you attack with (\w+) or more creatures$/.exec(h))) { const n = num(m[1]); if (typeof n !== 'number') return null; return { defs: [{ ev: 'youAttack', pl: 'you', ifc: { k: 'evAmtGE', n } }], cx: { it: 'self' } }; }
  if ((m = /^one or more (.+?) you control attack a player$/.exec(h))) { const fp = parseFilter(m[1]); if (!fp) return null; fp.f.ctrl = 'you'; return { defs: [{ ev: 'attackPlayer', f: fp.f }], cx: { it: 'self' } }; }
  if ((m = /^you cast an? (.+?) spell with mana value (\d+) or greater from your hand$/.exec(h))) { const fp = parseFilter(m[1] + ' spell'); if (!fp) return null; return { defs: [{ ev: 'cast', subj: 'any', f: { ...fp.f, mvGE: +m[2], fromHand: true }, pl: 'you' }], cx: { it: 'ev', that: 'ev' } }; }
  if ((m = /^you cast your first spell with \{x\} in its mana cost each turn$/.exec(h))) return { defs: [{ ev: 'cast', subj: 'any', f: { hasX: true }, pl: 'you', nth: { k: 'x', n: 1 } }], cx: { it: 'ev', that: 'ev' } } as never;
  if ((m = /^you cast a spell with mana value (\d+) or greater$/.exec(h)))
    return { defs: [{ ev: 'cast', pl: 'you', subj: 'any', mvGE: +m[1] }], cx: { it: 'ev', that: 'ev' } };
    if ((m = /^(you|an opponent|a player|target opponent) casts? (?:an|a|your first)\b ?(.*?) ?spell(?: this turn)?$/.exec(h.replace(/ spell of the chosen type$/, ' of the chosen type spell').replace(/^(.+?) spell (with mana value \d+ or (?:greater|less))$/, '$1 $2 spell')))) { if (/first/.test(h)) return null; const fp = m[2] ? parseFilter(/ with /.test(m[2]) ? m[2].replace(' with ', ' spell with ') : m[2] + ' spell') : { f: {} }; if (!fp) return null; return { defs: [{ ev: 'cast', subj: 'any', f: fp.f, pl: m[1] === 'you' ? 'you' : m[1] === 'a player' ? 'any' : 'notyou' }], cx: { it: 'ev', that: 'ev', thatPl: 'evp' } }; }
  if ((m = /^your commander (enters or attacks|enters|attacks|deals combat damage to a player|dies)$/.exec(h))) { const r = trigger(`a commander creature you own ${m[1]}`); if (r) for (const d0 of r.defs) if (d0.ev === 'attacks' || d0.ev === 'combatDamagePlayer') d0.f = { ...d0.f, ctrl: 'you' }; return r; }
  if (/^you attack with your commander$/.test(h)) { const r = trigger('a commander creature you own attacks'); if (r) for (const d0 of r.defs) d0.f = { ...d0.f, ctrl: 'you' }; return r; }
  if (/^one or more cards leave your graveyard$/.test(h)) return { defs: [{ ev: 'leaveGy', pl: 'you', batch: true }], cx: { it: 'self' } };
  if (/^one or more creature cards leave your graveyard$/.test(h)) return { defs: [{ ev: 'leaveGy', pl: 'you', batch: true, f: { types: ['Creature'] } }], cx: { it: 'self' } };
  if (/^you cast ~$/.test(h)) return { defs: [{ ev: 'castSelf', subj: 'self' }], cx: { it: 'self' } };
  if ((m = /^(you|an opponent) casts? (?:your|their) (first|second|third|fourth) ?(noncreature|instant, sorcery, or villain|) spell each turn$/.exec(h))) { const k = m[3] === '' ? 'n' : m[3] === 'noncreature' ? 'nonc' : 'isv'; const f: Filter = m[3] === 'noncreature' ? { notTypes: ['Creature'] } : m[3] ? { anyType: ['Instant', 'Sorcery', 'Villain'] } : {}; return { defs: [{ ev: 'cast', subj: 'any', f, pl: m[1] === 'you' ? 'you' : 'notyou', nth: { k, n: ORD[m[2]] } }], cx: { it: 'ev', that: 'ev', thatPl: 'evp' } } as never; }
  if ((m = /^(you|an opponent) draws? (?:your|their) (first|second|third) card each turn$/.exec(h))) return { defs: [{ ev: 'drawCard', pl: m[1] === 'you' ? 'you' : 'notyou', nth: { k: 'draw', n: ORD[m[2]] } }], cx: { it: 'self', thatPl: 'evp' } } as never;
  if ((m = /^an? ([a-z ]+?) (?:is|are) put into your graveyard from the battlefield$/.exec(h))) { const fp = parseFilter(m[1]); return fp && !fp.card ? { defs: [{ ev: 'dies', subj: 'any', f: { ...fp.f, ctrl: 'you' } }], cx: { it: 'ev', that: 'ev' } } : null; }
  if (/^you cast your commander$/.test(h)) return { defs: [{ ev: 'cast', subj: 'any', pl: 'you', filter: 'commander' }], cx: { it: 'ev' } };
  if (/^end of combat$/.test(h)) return { defs: [{ ev: 'endCombat' }], cx: { it: 'self' } };
  if (/^day becomes night or night becomes day$/.test(h) || /^night becomes day or day becomes night$/.test(h))
    return { defs: [{ ev: 'dayNight' }], cx: { it: 'self' } };
  if (/^~ phases in$/.test(h)) return { defs: [{ ev: 'phasesIn', subj: 'self' }], cx: { it: 'self' } };
  if (/^~ phases out$/.test(h)) return { defs: [{ ev: 'phasesOut', subj: 'self' }], cx: { it: 'self' } };
  if (/^the beginning of combat on your turn$/.test(h)) return { defs: [{ ev: 'beginCombat', pl: 'you' }], cx: { it: 'self', thatPl: 'evp' } };
  if ((m = /^the beginning of (your|each|each opponent's|each player's|the) (upkeep|end step|draw step|combat on your turn|combat|first main phase)$/.exec(h))) {
    const ev = { upkeep: 'upkeep', 'end step': 'endStep', 'draw step': 'drawStep', 'combat on your turn': 'beginCombat', combat: 'beginCombat', 'first main phase': 'firstMain' }[m[2]]!;
    const p = m[1] === 'your' || m[2] === 'combat on your turn' ? 'you' : m[1] === "each opponent's" ? 'notyou' : 'any';
    return { defs: [{ ev, pl: p as TriggerDef['pl'] }], cx: { it: 'self', thatPl: 'evp' } };
  }
  if (/^you gain life$/.test(h)) return { defs: [{ ev: 'gainLife', pl: 'you' }], cx: { it: 'self' } };
  if (/^you lose life$/.test(h)) return { defs: [{ ev: 'loseLife', pl: 'you' }], cx: { it: 'self' } };
  if (/^you lose life for the first time each turn$/.test(h)) return { defs: [{ ev: 'loseLife', pl: 'you', ifc: { k: 'firstLoseLife' } }], cx: { it: 'self' } };
  if (/^you exploit a creature$/.test(h)) return { defs: [{ ev: 'exploit', subj: 'self' }], cx: { it: 'self' } };
  if (/^tribute is not paid$/.test(h) || /^~ enters(?: the battlefield)?, if tribute wasn'?t paid$/.test(h)) return { defs: [{ ev: 'etb', subj: 'self', ifc: { k: 'tributeUnpaid' } }], cx: { it: 'self' } };
  if (/^an opponent loses life$/.test(h)) return { defs: [{ ev: 'loseLife', pl: 'notyou' }], cx: { it: 'self', thatPl: 'evp' } };
  if (/^you draw a card$/.test(h)) return { defs: [{ ev: 'drawCard', pl: 'you' }], cx: { it: 'self' } };
  if (/^a player draws a card$/.test(h)) return { defs: [{ ev: 'drawCard', pl: 'any' }], cx: { it: 'self', thatPl: 'evp' } };
  if (/^an opponent draws a card$/.test(h)) return { defs: [{ ev: 'drawCard', pl: 'notyou' }], cx: { it: 'self', thatPl: 'evp' } };
  if (/^an opponent draws a card except the first one they draw in each of their draw steps$/.test(h)) return { defs: [{ ev: 'drawCard', pl: 'notyou', exceptFirstDraw: true }], cx: { it: 'self', thatPl: 'evp' } };
  if (/^a player casts their second spell each turn$/.test(h)) return { defs: [{ ev: 'cast', pl: 'any', nth: { k: 'n', n: 2 } }], cx: { it: 'self', thatPl: 'evp' } };
  if (/^you cast a spell$/.test(h)) return { defs: [{ ev: 'cast', pl: 'you' }], cx: { it: 'self', that: 'ev' } };
  if (/^you discard a card$/.test(h)) return { defs: [{ ev: 'discard', pl: 'you' }], cx: { it: 'self' } };
  if (/^one or more creatures you control deal combat damage to a player$/.test(h)) return { defs: [{ ev: 'combatBatch', pl: 'you' }], cx: { it: 'self' } };
  if ((m = /^one or more (.+?) you control deal combat damage to a player$/.exec(h))) { const fp = parseFilter(m[1]); return fp ? { defs: [{ ev: 'combatBatch', pl: 'you', f: { ...fp.f, ctrl: 'you' } }], cx: { it: 'self' } } : null; }
  if (/^you attack$|^you attack with one or more creatures$/.test(h)) return { defs: [{ ev: 'youAttack', pl: 'you' }], cx: { it: 'self' } };
  if (/^you attack a player$/.test(h)) return { defs: [{ ev: 'attackPlayer', pl: 'you' }], cx: { it: 'self' } };
  if ((m = /^you sacrifice (a|an|another|one or more) (.+)$/.exec(h))) { const fp = parseFilter(m[2]); if (!fp) return null; if (m[1] === 'another') fp.f.other = true; return { defs: [{ ev: 'sacrificed', subj: 'any', f: fp.f, pl: 'you' }], cx: { it: 'ev', that: 'ev' } }; }
  { const ch = /^§chapter ([\d+]+)$/.exec(h); if (ch) return { defs: ch[1].split('+').map(n => ({ ev: 'chapter', subj: 'self', ifc: { k: 'evAmt', n: +n } })), cx: {} } as never; }
  { const lv = /^~ becomes level (\d+)$/.exec(h); if (lv) return { defs: [{ ev: 'classLevel', subj: 'self', ifc: { k: 'evAmt', n: +lv[1] } }], cx: {} } as never; }
  if (/^~ becomes saddled for the first time each turn$/.test(h)) return { defs: [{ ev: 'saddled', subj: 'self' }], cx: {} };
  if (/^~ connives$/.test(h)) return { defs: [{ ev: 'connive', subj: 'self' }], cx: { it: 'self' } };
  if ((m = /^(a|another) creature you control connives$/.exec(h))) return { defs: [{ ev: 'connive', subj: m[1] === 'another' ? 'other' : 'any', f: { types: ['Creature'], ctrl: 'you' } }], cx: { it: 'ev', that: 'ev' } };
  if (/^~ becomes crewed$/.test(h)) return { defs: [{ ev: 'crewed', subj: 'self' }], cx: {} };
  if (/^you unlock this door$/.test(h)) return { defs: [{ ev: 'unlock', subj: 'self' }], cx: { it: 'self' } };
  if (/^an opponent taps an artifact for mana$/.test(h)) return { defs: [{ ev: 'tappedForMana', subj: 'any', f: { types: ['Artifact'] }, pl: 'notyou' }], cx: { it: 'ev', that: 'ev' } };
  if (/^you create (?:a|one or more) tokens?$/.test(h)) return { defs: [{ ev: 'tokenCreated', subj: 'any', pl: 'you' }], cx: { it: 'ev', that: 'ev' } };
  if ((m = /^you create one or more (creature )?tokens?$/.exec(h))) return { defs: [{ ev: 'tokenCreated', subj: 'any', f: m[1] ? { types: ['Creature'], token: true } : { token: true }, pl: 'you', batch: true }], cx: { it: 'ev', that: 'ev' } };
  if ((m = /^(?:one or more|a) \+1\/\+1 counters? (?:is|are) put on (~|a creature you control|another creature you control)$/.exec(h))) return { defs: [{ ev: 'counterPut', kindF: '+1/+1', subj: m[1] === '~' ? 'self' : m[1].startsWith('another') ? 'other' : 'any', f: { types: ['Creature'], ctrl: 'you' } }], cx: { it: m[1] === '~' ? 'self' : 'ev', that: 'ev' } };
  if ((m = /^(?:one or more|a) -1\/-1 counters? (?:is|are) put on (a creature|~)$/.exec(h))) return { defs: [{ ev: 'counterPut', kindF: '-1/-1', subj: m[1] === '~' ? 'self' : 'any', f: { types: ['Creature'] } }], cx: { it: m[1] === '~' ? 'self' : 'ev', that: 'ev' } };
  if ((m = /^a land enters you control$/.exec(h))) return { defs: [{ ev: 'etb', subj: 'any', f: { types: ['Land'], ctrl: 'you' } }], cx: { it: 'self', that: 'ev' } };
  // P2 leftover heads — only events the engine already emits
  if (/^~ deals combat damage$/.test(h) || /^~ deals combat damage to a player or a planeswalker$/.test(h))
    return { defs: [{ ev: 'combatDamage', subj: 'self' }], cx: { it: 'self', that: 'ev', thatPl: 'evp' } };
  if (/^~ becomes tapped$/.test(h)) return { defs: [{ ev: 'becomesTapped', subj: 'self' }], cx: { it: 'self' } };
  if ((m = /^(an?|another) (.+?) becomes tapped$/.exec(h))) {
    const fp = parseFilter(m[2]); if (!fp) return null;
    if (m[1] === 'another') fp.f.other = true;
    return { defs: [{ ev: 'becomesTapped', subj: m[1] === 'another' ? 'other' : 'any', f: fp.f }], cx: { it: 'ev', that: 'ev' } };
  }
  if (/^an opponent discards a card$/.test(h)) return { defs: [{ ev: 'discard', pl: 'notyou', subj: 'any' }], cx: { it: 'ev', that: 'ev', thatPl: 'evp' } };
  if ((m = /^an opponent discards (?:a|an) (.+?) cards?$/.exec(h))) {
    const fp = parseFilter(m[1] + ' card'); if (!fp) return null;
    return { defs: [{ ev: 'discard', pl: 'notyou', subj: 'any', f: fp.f }], cx: { it: 'ev', that: 'ev', thatPl: 'evp' } };
  }
  if ((m = /^you discard (?:a|an) (.+?) cards?$/.exec(h))) {
    const fp = parseFilter(m[1] + ' card'); if (!fp) return null;
    return { defs: [{ ev: 'discard', pl: 'you', subj: 'any', f: fp.f }], cx: { it: 'ev', that: 'ev' } };
  }
  if (/^the beginning of your second main phase$/.test(h)) return { defs: [{ ev: 'secondMain', pl: 'you' }], cx: { it: 'self', thatPl: 'evp' } };
  if (/^~ becomes the target of a spell or ability an opponent controls$/.test(h) || /^~ becomes the target of a spell or ability$/.test(h))
    return { defs: [{ ev: 'targeted', subj: 'self', pl: h.includes('opponent') ? 'opp' : 'any' }], cx: { it: 'self' } };
  if (/^~ is turned face up$/.test(h)) return { defs: [{ ev: 'turnedFaceUp', subj: 'self' }], cx: { it: 'self' } };
  if (/^~ becomes monstrous$/.test(h)) return { defs: [{ ev: 'monstrous', subj: 'self' }], cx: { it: 'self' } };
  if (/^you scry$/.test(h)) return { defs: [{ ev: 'scry', pl: 'you' }], cx: { it: 'self' } };
  if (/^you commit a crime$/.test(h)) return { defs: [{ ev: 'crime', pl: 'you' }], cx: { it: 'self' } };
  if (/^~ exploits a creature$/.test(h)) return { defs: [{ ev: 'exploit', subj: 'self' }], cx: { it: 'self', that: 'ev' } };
  if (/^you cycle or discard a card$/.test(h) || /^you discard or cycle a card$/.test(h))
    return { defs: [{ ev: 'discard', pl: 'you' }], cx: { it: 'ev', that: 'ev' } };
  if (/^~ attacks alone$/.test(h)) return { defs: [{ ev: 'attacks', subj: 'self', ifc: { k: 'attacksAlone' } }], cx: { it: 'self' } };
  if ((m = /^(an?|another) (.+?) you control attacks alone$/.exec(h))) {
    const fp = parseFilter(m[2]); if (!fp) return null;
    if (m[1] === 'another') fp.f.other = true;
    fp.f.ctrl = 'you';
    return { defs: [{ ev: 'attacks', subj: m[1] === 'another' ? 'other' : 'any', f: fp.f, ifc: { k: 'attacksAlone' } }], cx: { it: 'ev', that: 'ev' } };
  }
  if (/^~ attacks and isn't blocked$/.test(h)) return { defs: [{ ev: 'unblocked', subj: 'self' }], cx: { it: 'self' } };
  if ((m = /^~ blocks or becomes blocked by (?:an? )?(.+)$/.exec(h))) {
    const fp = parseFilter(m[1]); if (!fp) return null;
    return { defs: [{ ev: 'blocks', subj: 'self', evF: fp.f }, { ev: 'blockedBy', subj: 'self', evF: fp.f }], cx: { it: 'self', that: 'ev' } };
  }
  if ((m = /^~ becomes blocked by (?:an? )?(.+)$/.exec(h))) {
    const fp = parseFilter(m[1]); if (!fp) return null;
    return { defs: [{ ev: 'blockedBy', subj: 'self', evF: fp.f }], cx: { it: 'self', that: 'ev' } };
  }
  if (/^~ becomes blocked$/.test(h)) return { defs: [{ ev: 'blocked', subj: 'self' }], cx: { it: 'self', that: 'ev' } };
  if (/^~ blocks$/.test(h)) return { defs: [{ ev: 'blocks', subj: 'self' }], cx: { it: 'self', that: 'ev' } };
  if ((m = /^~ blocks (?:an? )?(.+)$/.exec(h))) {
    const fp = parseFilter(m[1]); if (!fp) return null;
    return { defs: [{ ev: 'blocks', subj: 'self', evF: fp.f }], cx: { it: 'self', that: 'ev' } };
  }
  if ((m = /^(?:another |an? |one or more )(.+?) phases in$/.exec(h))) {
    const fp = parseFilter(m[1]); if (!fp) return null;
    return { defs: [{ ev: 'phasesIn', subj: 'any', f: fp.f }], cx: { it: 'ev', that: 'ev' } };
  }
  if (/^~ or another (.+?) phases in$/.exec(h) || (m = /^~ or another (.+?) you control phases in$/.exec(h))) {
    const mm = /^~ or another (.+?)(?: you control)? phases in$/.exec(h)!;
    const fp = parseFilter(mm[1]); if (!fp) return null;
    fp.f.ctrl = fp.f.ctrl ?? 'you';
    return { defs: [{ ev: 'phasesIn', subj: 'any', f: { ...fp.f, ctrl: 'you' } }], cx: { it: 'ev', that: 'ev' } };
  }
  return null;
}
export const pl2: Record<string, TriggerDef['pl']> = { you: 'you', any: 'any', notyou: 'opp' };
const ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4 };

export function compile(sc: ScryLike, d: CardDef): CompileResult {
  const unparsed: string[] = []; const notes: string[] = []; CUR_NAME = sc.name;
  const text = normalize(sc.oracle_text ?? '', sc.name);
  { const ov = /^overload (\{[^}]+\}(?:\{[^}]+\})*)\.?\s*$/m.exec(text); const oc = ov ? parseCost(ov[1].toUpperCase()) : null;
    if (ov && oc && (d.types.includes('Instant') || d.types.includes('Sorcery'))) {
      const body = (sc.oracle_text ?? '').split('\n').filter(l => !/^overload /i.test(l.trim())).join('\n');
      const d2: CardDef = JSON.parse(JSON.stringify(d)); const r2 = compile({ ...sc, oracle_text: body.replace(/\btarget\b/gi, 'each') }, d2);
      const r1 = compile({ ...sc, oracle_text: body }, d); CUR_NAME = sc.name;
      if (!r2.unparsed.length && d2.spell && !(d2.spell.target || d2.spell.tslots?.length)) { d.overload = { cost: oc, spell: d2.spell }; return r1; }
      return { ...r1, ok: false, unparsed: [...r1.unparsed, ov[0]] };
    } }
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
    if (/^imprint[ \u2014\u2013-]/.test(raw)) d.imprint = true;
    { const fm = /^(?:forecast[ \u2014\u2013-]+)?((?:\{[^}]+\})+), reveal (?:this card|~) from your hand: (.+)$/i.exec(l);
      if (fm) {
        const c = parseCost(fm[1].toUpperCase());
        const fx = effects(fm[2], newCx({ it: 'self' }));
        if (c && fx) { abilities.push({ label: `Forecast ${fm[1].toUpperCase()}`, mana: c, zone: 'hand', once: true, forecast: true, effects: fx }); continue; }
      }
    }
    { const ch = d.sub?.includes('Saga') ? /^((?:i|ii|iii|iv|v|vi|vii)(?:, (?:i|ii|iii|iv|v|vi|vii))*) — (.+)$/s.exec(raw.replace(/\.$/, '')) : null;
      if (ch) { const ns = ch[1].split(', ').map(x => ROM[x]); d.saga = Math.max(d.saga ?? 0, ...ns);
        let body = ch[2];
        const fl = /^(?!choose )([a-z][a-z' !]{0,28} — )(.+)$/s.exec(body);
        if (fl) body = fl[2];
        l = `when §chapter ${ns.join('+')}, ${body}`; } }
    { let x: RegExpExecArray | null;
      if ((x = /^mobilize (\d+)$/.exec(l))) l = `whenever ~ attacks, §mobilize ${x[1]}`;
      else if ((x = /^firebending (\w+(?:, where x is .+)?)$/.exec(l))) l = `whenever ~ attacks, §firebend ${x[1]}`;
      else if (/^job select$/.test(l)) l = 'when ~ enters, §jobselect';
      // The engine has no effects that copy spells, so "cast or copy" triggers only on casts (exact while that holds).
      l = l.replace(/^whenever you cast or copy /, 'whenever you cast ').replace(/^void — /, '').replace(/^vivid — /, '').replace(/^whenever ~ attacks while saddled, /, 'whenever ~ attacks, if ~ is saddled, ').replace(/^whenever ~ attacks while (.+?), /, 'whenever ~ attacks, if $1, ');
      if (/^companion[—\- ]/.test(l)) continue;
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
    if (/^whenever a creature entering under an opponent's control causes a triggered ability of that creature to trigger, you may copy that ability/.test(l)) { d.copyOppEtb = true; continue; }
    // keyword line
    { const fl = /^flashback—(\{[^}]+\}(?:\{[^}]+\})*), pay (\d+) life\.?$/.exec(l); if (fl) { const c = parseCost(fl[1].toUpperCase()); if (c) { d.flashback = c; d.flashbackLife = +fl[2]; continue; } } }
    if (l === 'cascade' || l === 'cascade, cascade') { const times = l.includes(',') ? 2 : 1; const mvv = d.cost.generic + (['W', 'U', 'B', 'R', 'G', 'C'] as const).reduce((a, k) => a + (d.cost[k] ?? 0), 0) + (d.cost.hyb?.length ?? 0); for (let i = 0; i < times; i++) triggers.push({ on: 'x', label: 'Cascade', ev: 'castSelf', subj: 'self', effects: [{ op: 'discover', kind: 'cascade', n: mvv }] } as TriggerDef); continue; }
    if (l === 'demonstrate') { triggers.push({ on: 'x', label: 'Demonstrate', ev: 'castSelf', subj: 'self', effects: [{ op: 'script', kind: 'demonstrate' }] } as TriggerDef); continue; }
    if (l === 'myriad') { kws.add('myriad'); continue; }
    if (l === 'gravestorm') { triggers.push({ on: 'x', label: 'Gravestorm', ev: 'castSelf', subj: 'self', effects: [{ op: 'script', kind: 'gravestorm' }] } as TriggerDef); continue; }
    if (l === 'storm') { d.storm = true; triggers.push({ on: 'x', label: 'Storm', ev: 'castSelf', subj: 'self', effects: [{ op: 'script', kind: 'storm' }] } as TriggerDef); continue; }
    if (l === 'split second') { d.splitSecond = true; kws.add('split second'); continue; }
    { const an = /^annihilator (\d+)$/.exec(l); if (an) { triggers.push({ on: 'x', label: `Annihilator ${an[1]}`, ev: 'attacks', subj: 'self', effects: [{ op: 'script', kind: 'annihilator', n: +an[1] }] } as TriggerDef); continue; } }
    { const eh = /^echo (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(l); if (eh) { const c = parseCost(eh[1].toUpperCase()); if (!c) { fail(raw); continue; } d.echo = c; triggers.push({ on: 'x', label: 'Echo', ev: 'upkeep', pl: 'you', effects: [{ op: 'script', kind: 'echo' }] } as TriggerDef); continue; } }
    { const es = /^escape[—\-]?(\{[^}]+\}(?:\{[^}]+\})*), exile (\w+) other cards? from your graveyard$/.exec(l); if (es) { const c = parseCost(es[1].toUpperCase()); if (!c) { fail(raw); continue; } d.escape = { cost: c, n: (num(es[2]) as number) }; continue; } }
    { const esc2 = /^~ escapes with (a|an|one|two|three|four|five|six|x|\d+) ([+-]\d\/[+-]\d|[a-z]+) counters? on it$/.exec(l); if (esc2) { d.escapeCtr = { kind: esc2[2], n: num(esc2[1])! }; continue; } }
    const kparts = l.split(/[,;] /);
    if (kparts.every(p => isKeyword(p.trim(), d, kws, abilities, sc))) continue;
    // modal
    let both: Cond | undefined;
    { const bi = /^choose one\. if (.+?), (?:you may )?choose both instead\.?\n(.*)$/s.exec(l); if (bi) { const c = cond(bi[1].replace(/ as you cast ~$/, ''), newCx()); if (!c) { fail(raw); continue; } both = c; l = `choose one —\n${bi[2]}`; } }
    { const repM = /^choose (one|two|three|four)\. you may choose the same mode more than once\.\n?(.*)$/s.exec(l); if (repM) l = `choose ${repM[1]} —\n${repM[2]}`; }
    const rep = /you may choose the same mode more than once/.test(raw);
    const mm = /^choose (one|two|three|one or both|one or more|any number|up to (?:one|two|three)) —\n?(.*)$/s.exec(l);
    if (mm) {
      const cx = newCx({ spell: isSpell });
      const ms = parseModes(mm[1], mm[2], cx); if (!ms) { fail(raw); continue; }
      if (both) { if (ms.list.length !== 2) { fail(raw); continue; } ms.bothIf = both; }
      if (rep) ms.repeat = true;
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
      if ((x = /^whenever enchanted land is tapped for mana, its controller adds an additional \{([wubrgc])\}$/.exec(l))) { statics.push({ k: 'manaExtra', who: 'attached', add: [x[1].toUpperCase()] }); continue; }
      if (/^~ enters prepared$/.test(l)) { d.etbPrepared = true; continue; }
      if ((x = /^as long as ~ isn't on the battlefield, it's an? (\d+)\/(\d+) ([a-z]+) creature in addition to its other types$/.exec(l))) { const sb = SUB.get(x[3]) ?? x[3][0].toUpperCase() + x[3].slice(1); d.offBf = { addTypes: ['Creature'], addSub: [sb], p: +x[1], t: +x[2] }; continue; }
      if (/^as long as ~ is attached to a creature, ~ can't be attacked and has "whenever equipped creature deals combat damage during your turn, put that many loyalty counters on ~\.?"$/.test(l)) {
        statics.push({ k: 'cantBeAttacked', who: 'self', cond: { k: 'attachedCreature' } });
        triggers.push({ on: 'x', label: 'Whenever equipped creature deals combat damage during your turn, put that many loyalty counters on ~.', ev: 'combatDamage', subj: 'attached', ifc: { k: 'yourTurn' }, effects: [{ op: 'addC', kind: 'loyalty', n: 'ev', who: 'self' }] } as TriggerDef); continue; }
    }
    { const sm = /^when you control no (.+?), sacrifice ~$/.exec(l);
      if (sm) { const fp = parseFilter(sm[1]); if (fp) { d.sacIfNo = fp.f; continue; } } }
    // triggered
    const tm = /^(when|whenever|at) (.+?), (.+)$/s.exec(l);
    if (tm && !isSpell) {
      let head = tm[2]; let body = tm[3];
      if (tm[1] === 'at') head = head.replace(/^the beginning of the end step$/, 'the beginning of each end step');
      let once = false;
      body = body.replace(/\. this ability triggers only once each turn$/, () => { once = true; return ''; });
      body = body.replace(/\. do this only once each turn$/, () => { once = true; return ''; });
      const tr = trigger(tm[1] === 'at' ? head : head);
      if (!tr) { if (staticLine(l, d, statics, kws)) continue; fail(raw); continue; }
      const cx = newCx(tr.cx);
      let ifc: Cond | undefined;
      const im = /^if (.+?), (.+)$/s.exec(body);
      if (im) { const c = cond(im[1], cx); if (c) { ifc = c; body = im[2]; } }
      const md = /^choose (one|two|one or both|one or more|up to one) —\n?(.*)$/s.exec(body);
      let fx: Effect[] | null = null; let modes: Modes | undefined;
      if (md) { modes = parseModes(md[1], md[2], cx) ?? undefined; if (!modes) { fail(raw); continue; } fx = []; }
      else fx = effects(body, cx);
      if (!fx) {
        const eoc = /^(.*) at end of combat$/.exec(body);
        if (eoc) { fx = effects(eoc[1], cx); if (fx) fx = [{ op: 'delayEoc', sub: fx }]; }
      }
      if (!fx) { fail(raw); continue; }
      for (const t of tr.defs) triggers.push({ on: 'x', label: shortLabel(raw), effects: fx, tslots: cx.slots.length && !modes ? cx.slots : undefined, modes, ifc, once: once || undefined, ...t, pl: t.pl ? pl2[t.pl] ?? t.pl : undefined } as TriggerDef);
      continue;
    }
    // activated
    const am = /^([^:"]+): (.+)$/s.exec(l);
    if (am && !isSpell && /\{|sacrifice|discard|pay|remove|exile|tap|put/.test(am[1])) {
      const pc = parseCosts(am[1], sc.name); if (!pc) { fail(raw); continue; }
      let body = am[2]; const ab: ActAbility = { label: shortLabel(raw), effects: [], ...pc.ab } as ActAbility;
      { const fl = /^add (.+?)\. ~ doesn't untap during your next untap step$/.exec(body) ?? /^add (.+?); ~ doesn't untap during your next untap step$/.exec(body);
        if (fl) { const r = manaAdd(fl[1], newCx()); if (r && ab.tap && Object.keys(pc.ab).length === 1) { manaLines.push({ add: r.mana, n: r.n, skipNextUntap: true }); continue; } }
        const cop = /^the next time an? (white|blue|black|red|green) source would deal damage to you this turn, prevent that damage$/.exec(body);
        if (cop) { const C: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }; ab.effects = [{ op: 'script', kind: 'preventColor', text: C[cop[1]] }]; abilities.push(ab); continue; }
      }
      body = body.replace(/\. activate (?:this ability )?only as a sorcery$/, () => { ab.sorcery = true; return ''; })
        .replace(/\. this ability costs \{1\} less to activate for each legendary creature you control$/, () => { ab.lessLegend = true; return ''; })
        .replace(/\. activate (?:this ability )?only once each turn$/, () => { ab.once = true; return ''; })
        .replace(/\. activate (?:this ability )?only during your turn$/, () => { ab.cond = { k: 'yourTurn' }; return ''; })
        .replace(/\. activate (?:this ability )?only if (.+)$/, (_, c) => { const cc = cond(c, newCx()); if (!cc) return '§FAIL'; ab.cond = cc; return ''; });
      if (body.includes('§FAIL')) { fail(raw); continue; }
      // mana abilities
      let only: string | undefined; let manaUnc = false;
      body = body.replace(/, and that spell can't be countered$/, () => { manaUnc = true; return ''; });
      body = body.replace(/\. if that mana is spent on a dragon creature spell, it gains haste until end of turn$/, () => { only = 'dragonHaste'; return ''; });
      body = body.replace(/\. if any of that mana is spent on a creature spell, it gains haste until end of turn$/, () => { only = 'creatureHaste'; return ''; });
      body = body.replace(/\. (?:spend this mana only to (.+)|this mana can't be spent to (?:cast (?:a )?nonartifact spells?|pay generic mana costs))$/, (_, w?: string) => { only = !w ? (/generic mana costs/.test(body) ? 'nongeneric' : 'artifact') : ({ 'cast a creature spell of the chosen type': 'ctypeSpell', 'cast a creature spell of the chosen type or activate an ability of a creature source of the chosen type': 'ctypeAny', 'cast a hero spell or to activate an ability of a hero source': 'hero', 'cast a villain spell or to activate an ability of a villain source': 'villain', 'cast a legendary spell': 'legendary', 'cast an instant or sorcery spell': 'is', 'cast artifact spells or activate abilities of artifacts': undefined, 'cast a creature spell': 'creature', 'cast elemental spells or activate abilities of elemental sources': 'elemental', 'cast an elemental spell or activate an ability of an elemental': 'elemental', 'cast elemental spells or activate abilities of elementals': 'elemental', 'cast an angel spell': 'angel', 'cast a dragon creature spell': 'dragonCreature', 'cast dragon spells or activate abilities of dragons': 'dragon' } as Record<string, string | undefined>)[w] ?? '§'; return ''; });
      body = body.replace(/^(add one mana of any color in your commander's color identity)\. when that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1$/, (_, x) => { only = 'path'; return x; });
      if (only === '§') { fail(raw); continue; }
      if (only) { const r = /^add (.+)$/.exec(body) && manaAdd(body.slice(4), newCx()); if (!r || !ab.tap) { fail(raw); continue; } manaLines.push({ add: r.mana, n: r.n, only, cost: ab.mana, skipNextUntap: ab.exert || undefined, uncounter: manaUnc || undefined }); continue; }
      if (/^add \{c\}\. if ~ has a luck counter on it, instead add one mana of any color$/.test(body) && ab.tap && Object.keys(pc.ab).length === 1) { manaLines.push({ add: ['C'], luckAny: true }); continue; }
      const pm = /^add (.+?)\. ~ deals (\d) damage to you$/.exec(body);
      if (pm && ab.tap && Object.keys(pc.ab).length === 1) { const r = manaAdd(pm[1], newCx()); if (r) { manaLines.push({ add: r.mana, n: r.n, pain: +pm[2] }); continue; } }
      const fm = /^add (\{[wubrg]\}\{[wubrg]\}), (\{[wubrg]\}\{[wubrg]\}), or (\{[wubrg]\}\{[wubrg]\})$/.exec(body);
      if (fm && ab.tap && ab.mana?.hyb?.length) { ab.manaAb = true; ab.effects = [{ op: 'script', kind: 'filterMana', text: `${fm[1]}|${fm[2]}|${fm[3]}` }]; abilities.push(ab); continue; }
      const madd = /^add (.+)$/.exec(body);
      if (madd) {
        const r = manaAdd(madd[1], newCx()); if (r) {
        if (ab.tap && Object.keys(pc.ab).length === 1 && !ab.cond) { manaLines.push({ add: r.mana, n: r.n }); continue; }
        if (ab.tap && pc.ab.sac && Object.keys(pc.ab).length === 2 && !r.n && r.mana.length === 1) { manaLines.push({ add: r.mana, sac: true }); continue; }
        ab.manaAb = true; ab.effects = [{ op: 'addMana', mana: r.mana as string[], n: r.n ?? 1 }]; abilities.push(ab); continue;
        }
      }
      const cx = newCx();
      const md = /^choose (one|two|one or both) —\n?(.*)$/s.exec(body);
      if (md) { const ms = parseModes(md[1], md[2], cx); if (!ms) { fail(raw); continue; } ab.modes = ms; abilities.push(ab); continue; }
      const fx = effects(body, cx); if (!fx) { fail(raw); continue; }
      ab.effects = fx; if (cx.slots.length) ab.tslots = cx.slots;
      if (fx.length && fx.every(e => e.op === 'addMana') && !cx.slots.length) ab.manaAb = true;
      abilities.push(ab); continue;
    }
    // spell text
    if (isSpell && (/^(~|this spell) (can't be countered|costs)|^as an additional cost|^cast (?:this spell|~) only |rather than pay /.test(l)) && staticLine(l, d, statics, kws)) continue;
    if (isSpell) {
      const cx = newCx({ spell: true });
      const fx = effects(l, { ...cx, slots: spellSlots, it: spellSlots.length ? 't0' : 'self' });
      if (!fx) { fail(raw); continue; }
      if (fx.length === 1 && fx[0].op === 'if' && !fx[0].else && spellFx.length && /instead if/.test(l)) { const prev = spellFx.splice(0); spellFx.push({ op: 'if', cond: fx[0].cond, sub: fx[0].sub, else: prev }); continue; }
      spellFx.push(...fx); continue;
    }
    // statics
    if (staticLine(l, d, statics, kws)) continue;
    fail(raw);
  }
  if (isSpell && spellFx.length >= 2) {
    const last = spellFx[spellFx.length - 1];
    if (last.op === 'if' && !last.else && spellFx.slice(0, -1).every(e => e.op === 'addMana')) {
      const prev = spellFx.slice(0, -1);
      spellFx = [{ op: 'if', cond: last.cond, sub: last.sub, else: prev }];
    }
  }
  // merge mana lines
  if (manaLines.length) {
    if (manaLines.length === 1) d.mana = [manaLines[0]];
    else if (manaLines.every(m => m.add.length === 1 && !m.n && !m.sac && !m.only && !/ANY|IDENTITY|OPP|LEGEND/.test(m.add[0]))) { const pain = Math.max(0, ...manaLines.map(m => m.pain ?? 0)); d.mana = [{ add: [[...new Set(manaLines.flatMap(m => m.add[0].split('|')))].join('|') as ManaSym], pain: pain || undefined }]; if (pain) notes.push('pain: damage is dealt whenever it is tapped for mana, even for {C}'); }
    else d.mana = manaLines;
  }
  if (d.champion) { const ty = d.champion; triggers.push({ on: 'x', ev: 'etb', subj: 'self', label: `Champion a ${ty}`, effects: [{ op: 'champion' }] } as TriggerDef, { on: 'x', ev: 'ltb', subj: 'self', label: `Return the exiled ${ty}`, effects: [{ op: 'championBack' }] } as TriggerDef); }
  if (d.mentor) triggers.push({ on: 'x', ev: 'attacks', subj: 'self', label: 'Mentor', tslots: [{ who: 'perm', f: { types: ['Creature'], attacking: true, other: true, powLTSrc: true } }], effects: [{ op: 'addC', kind: '+1/+1', n: 1, who: 't0' }] } as TriggerDef);
  if (d.evolve) triggers.push({ on: 'x', ev: 'etb', subj: 'other', f: { types: ['Creature'], ctrl: 'you' }, ifc: { k: 'evolve' }, label: 'Evolve', effects: [{ op: 'addC', kind: '+1/+1', n: 1, who: 'self' }] } as TriggerDef);
  if (kws.has('undying')) triggers.push({ on: 'x', ev: 'dies', subj: 'self', ifc: { k: 'noP1P1' }, label: 'Undying', effects: [{ op: 'undying' }] } as TriggerDef);
  if (d.soulbond) triggers.push({ on: 'x', ev: 'etb', subj: 'self', label: 'Soulbond: pair with another unpaired creature you control', effects: [{ op: 'soulPair' }] } as TriggerDef, { on: 'x', ev: 'etb', subj: 'other', f: { types: ['Creature'], ctrl: 'you' }, label: 'Soulbond: you may pair with that creature', effects: [{ op: 'soulPair', who: 'ev' }] } as TriggerDef);
  if (d.impending) triggers.push({ on: 'x', label: 'remove a time counter', ev: 'endStep', pl: 'you', effects: [{ op: 'script', kind: 'remTime' }] });
  if (d.dethrone) triggers.push({ on: 'x', ev: 'attacks', subj: 'self', ifc: { k: 'atkMostLife' }, label: 'Dethrone', effects: [{ op: 'addC', kind: '+1/+1', n: 1, who: 'self' }] } as TriggerDef);
  { const bm = [...kws].map(k => /^bushido (\d+)$/.exec(k)).find(Boolean); if (bm) { const n = +bm[1]; const fx = [{ op: 'pump', n, m: n, who: 'self' as const, until: 'eot' as const }]; triggers.push({ on: 'x', ev: 'blocks', subj: 'self', label: `Bushido ${n}`, effects: fx } as TriggerDef, { on: 'x', ev: 'blocked', subj: 'self', label: `Bushido ${n}`, effects: fx } as TriggerDef); } }
  if (kws.has('flanking')) triggers.push({ on: 'x', ev: 'blocked', subj: 'self', label: 'Flanking', effects: [{ op: 'script', kind: 'flanking' }] } as TriggerDef);
  if (d.modular) triggers.push({ on: 'x', ev: 'dies', subj: 'self', label: 'Modular', tslots: [{ who: 'perm', f: { types: ['Artifact', 'Creature'] }, harm: false, opt: true }], effects: [{ op: 'script', kind: 'modular' }] } as TriggerDef);
  if (d.graft) triggers.push({ on: 'x', ev: 'etb', subj: 'other', f: { types: ['Creature'] }, label: 'Graft', effects: [{ op: 'script', kind: 'graft' }] } as TriggerDef);
  { const rm = [...kws].map(k => /^renown (\d+)$/.exec(k)).find(Boolean); if (rm) triggers.push({ on: 'x', ev: 'combatDamagePlayer', subj: 'self', ifc: { k: 'notRenowned' }, label: `Renown ${rm[1]}`, effects: [{ op: 'script', kind: 'renown', n: +rm[1] }] } as TriggerDef); }
  { const am = [...kws].map(k => /^afterlife (\d+)$/.exec(k)).find(Boolean); if (am) triggers.push({ on: 'x', ev: 'dies', subj: 'self', label: `Afterlife ${am[1]}`, effects: [{ op: 'token', n: +am[1], pl: 'you', tok: { name: 'Spirit', p: 1, t: 1, colors: ['W', 'B'], types: ['Creature'], sub: ['Spirit'], kws: ['flying'] } }] } as TriggerDef); }
  { const af = [...kws].map(k => /^afflict (\d+)$/.exec(k)).find(Boolean); if (af) triggers.push({ on: 'x', ev: 'blocked', subj: 'self', label: `Afflict ${af[1]}`, effects: [{ op: 'lose', n: +af[1], pl: 'def' }] } as TriggerDef); }
  if (d.fabricate) triggers.push({ on: 'x', ev: 'etb', subj: 'self', label: `Fabricate ${d.fabricate}`, effects: [{ op: 'script', kind: 'fabricate', n: d.fabricate }] } as TriggerDef);
  if (d.offspring) triggers.push({ on: 'x', ev: 'etb', subj: 'self', ifc: { k: 'offspringPaid' }, label: 'Offspring', effects: [{ op: 'script', kind: 'offspring' }] } as TriggerDef);
  if (d.extort) triggers.push({ on: 'x', ev: 'cast', pl: 'you', label: 'Extort', effects: [{ op: 'may', text: 'pay {W/B} to extort', ifPaid: { generic: 0, hyb: ['W|B'] }, sub: [{ op: 'script', kind: 'extort' }] }] } as TriggerDef);
  if (kws.has('training')) triggers.push({ on: 'x', ev: 'attacks', subj: 'self', ifc: { k: 'training' }, label: 'Training', effects: [{ op: 'addC', kind: '+1/+1', n: 1, who: 'self' }] } as TriggerDef);
  { const rp = [...kws].map(k => /^rampage (\d+)$/.exec(k)).find(Boolean); if (rp) triggers.push({ on: 'x', ev: 'blocked', subj: 'self', label: `Rampage ${rp[1]}`, effects: [{ op: 'script', kind: 'rampage', n: +rp[1] }] } as TriggerDef); }
  if (kws.has('provoke')) triggers.push({ on: 'x', ev: 'attacks', subj: 'self', label: 'Provoke', tslots: [{ who: 'perm', f: { types: ['Creature'], defP: true }, harm: false, opt: true }], effects: [{ op: 'script', kind: 'provoke' }] } as TriggerDef);
  if (kws.has('ingest')) triggers.push({ on: 'x', ev: 'combatDamagePlayer', subj: 'self', label: 'Ingest', effects: [{ op: 'script', kind: 'ingest' }] } as TriggerDef);
  if (d.forMirrodin) triggers.push({ on: 'x', ev: 'etb', subj: 'self', label: 'For Mirrodin!', effects: [{ op: 'script', kind: 'forMirrodin' }] } as TriggerDef);
  if (d.soulshift) triggers.push({ on: 'x', ev: 'dies', subj: 'self', label: `Soulshift ${d.soulshift}`, tslots: [{ who: 'card', f: { types: ['Creature', 'Spirit'], mvLE: d.soulshift }, zoneOwner: 'you', harm: false, opt: true }], effects: [{ op: 'ret', who: 't0', dest: 'hand', zone: 'graveyard' }] } as TriggerDef);
  if (d.partnerWith) triggers.push({ on: 'x', ev: 'etb', subj: 'self', label: `Partner with ${d.partnerWith}`, tslots: [{ who: 'player', opt: true }], effects: [{ op: 'script', kind: 'partnerWith', text: d.partnerWith }] } as TriggerDef);
  if (d.exploit) triggers.push({ on: 'x', ev: 'etb', subj: 'self', label: 'Exploit', effects: [{ op: 'script', kind: 'exploit' }] } as TriggerDef);
  if (d.storm && !triggers.some(t => t.label === 'Storm')) triggers.push({ on: 'x', label: 'Storm', ev: 'castSelf', subj: 'self', effects: [{ op: 'script', kind: 'storm' }] } as TriggerDef);
  if (d.cumUpkeep) triggers.push({ on: 'x', label: 'Cumulative upkeep', ev: 'upkeep', pl: 'you', effects: [{ op: 'script', kind: 'cumUpkeep' }] } as TriggerDef);
  if (d.fading !== undefined) {
    d.etbCounters = d.etbCounters ?? { kind: 'fade', n: d.fading };
    triggers.push({ on: 'x', label: 'Fading', ev: 'upkeep', pl: 'you', effects: [{ op: 'script', kind: 'fading' }] } as TriggerDef);
  }
  if (d.vanishing !== undefined) {
    d.etbCounters = d.etbCounters ?? { kind: 'time', n: d.vanishing };
    triggers.push({ on: 'x', label: 'Vanishing', ev: 'upkeep', pl: 'you', effects: [{ op: 'script', kind: 'vanishing' }] } as TriggerDef);
  }
  if (d.cipher && (d.types.includes('Instant') || d.types.includes('Sorcery'))) spellFx.push({ op: 'script', kind: 'cipher' });
  if (d.learn && (d.types.includes('Instant') || d.types.includes('Sorcery'))) {
    spellFx.push({ op: 'script', kind: 'learn' });
  }

  if (abilities.length) d.abilities = [...(d.abilities ?? []), ...abilities];
  if (triggers.length) d.triggers = [...(d.triggers ?? []), ...triggers];
  if (statics.length) d.statics = statics;
  if (spellFx.length || spellModes) d.spell = { effects: spellFx, tslots: spellSlots.length ? spellSlots : undefined, modes: spellModes };
  if (d.escalateCost && d.spell?.modes) d.spell.modes.escalateCost = d.escalateCost;
  if (kws.size) d.keywords = [...kws];
  if (d.aura) { const bad = statics.some(s => s.who === 'attached' && ((s.k === 'pt' && typeof s.t === 'number' && s.t < 0) || s.k === 'cantBlock' || s.k === 'cantAttack')); d.aura.harm = bad; if (!bad && d.aura.f && !d.aura.f.ctrl) d.aura = { ...d.aura }; }
  if (isSpell && !d.spell && !triggers.some(t => (t as TriggerDef & { ev?: string }).ev === 'castSelf') && unparsed.length === 0 && text.trim()) unparsed.push('(no effect)');
  if (d.legendary && (d.stationAt || d.sub?.includes('Spacecraft')) && !d.types.includes('Creature')) d.canBeCommander = true;
  d.compiled = true;
  return { unparsed, notes, ok: unparsed.length === 0 };
}
let CUR_NAME = '';
/** Set the card name used by pretty() / token ability compilation. */
export function setOracleName(name: string): void { CUR_NAME = name; }
export function oracleName(): string { return CUR_NAME; }
/** Make normalized text readable: card name back in, sentences capitalized. */
export function pretty(s: string, name = CUR_NAME): string { const short = name.split(',')[0]; return s.replace(/~/g, short || 'this').replace(/(^|[.!?]\s+|\n•?\s*|: |— )([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/\b(i|ii|iii|iv)\b(?= —)/g, m => m.toUpperCase()); }
export function shortLabel(s: string) { const t = pretty(s.replace(/\([^)]*\)/g, '').trim()); return t.length > 90 ? t.slice(0, 87) + '…' : t; }
export function parseModes(head: string, rest: string, cx: Cx): Modes | null {
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
export function isKeyword(p: string, d: CardDef, kws: Set<string>, abilities: ActAbility[], sc: ScryLike): boolean {
  let m: RegExpExecArray | null;
  if (KWS.includes(p)) { kws.add(p); return true; }
  if ((m = /^protection from (white|blue|black|red|green)(?: and from (white|blue|black|red|green))?$/.exec(p))) { kws.add('protection from ' + m[1]); if (m[2]) kws.add('protection from ' + m[2]); return true; }
  if (p === 'protection from creatures' || p === 'protection from multicolored') { kws.add(p); return true; }
  if ((m = /^ward (\{\d+\})$/.exec(p))) { d.ward = parseCost(m[1])!.generic; return true; }
  if ((m = /^equip(?: (.+?))? (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) {
    const c = parseCost(m[2].toUpperCase()); if (!c) return false; let f: Filter = { types: ['Creature'], ctrl: 'you' };
    if (m[1] === 'commander') f = { types: ['Creature'], ctrl: 'you', cmdr: 'any' };
    else if (m[1]) { const fp = parseFilter(m[1]); if (!fp) return false; f = { ...fp.f, types: [...(fp.f.types ?? []), 'Creature'], ctrl: 'you' }; }
    abilities.push({ label: `Equip ${m[2].toUpperCase()}`, mana: c, sorcery: true, equip: true, tslots: [{ who: 'perm', f, harm: false }], effects: [{ op: 'attach', who: 'self', other: 't0' }] }); return true;
  }
  if ((m = /^warp (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.warp = c; return true; }
  if (p === 'sunburst') { d.sunburst = true; kws.add('sunburst'); return true; }
  if ((m = /^dredge (\d+)$/.exec(p))) { d.dredge = +m[1]; kws.add('dredge'); return true; }
  { const ak = /^(evoke|mayhem|harmonize|web-slinging) (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p); if (ak && !d.types.includes('Land')) { const c = parseCost(ak[2].toUpperCase()); if (!c) return false; if (ak[1] === 'evoke') { if (!d.types.includes('Creature')) return false; d.evoke = c; } else if (ak[1] === 'mayhem') d.mayhem = c; else if (ak[1] === 'harmonize') d.harmonize = c; else d.webSling = c; return true; } }
  if ((m = /^foretell (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p)) && !d.types.includes('Land')) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.foretell = c; return true; }
  if ((m = /^sneak (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p)) && !d.types.includes('Land')) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.sneak = c; return true; }
  if ((m = /^ninjutsu (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p)) && d.types.includes('Creature')) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.ninjutsu = c; return true; }
  if (p === 'evolve') { d.evolve = true; return true; }
  if (p === 'undying') { kws.add('undying'); return true; }
  if (p === 'persist') { kws.add('persist'); return true; }
  if (p === 'wither') { kws.add('wither'); return true; }
  if (p === 'myriad') { kws.add('myriad'); return true; }
  { const wb = /^ward[—\-]blight (\d+)$/.exec(p); if (wb) { d.wardBlight = +wb[1]; return true; } }
  { const evx = /^evoke[—\-]exile an? (white|blue|black|red|green) card from your hand$/.exec(p); if (evx && d.types.includes('Creature')) { const C: Record<string, 'W' | 'U' | 'B' | 'R' | 'G'> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }; d.evokeExile = C[evx[1]]; return true; } }

  if (p === 'improvise') { d.improvise = true; return true; }
  if ((m = /^teamwork (\d+)$/.exec(p))) { d.teamwork = +m[1]; return true; }
  if (p === 'storied') { d.storied = true; return true; }
  if ((m = /^level up (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; abilities.push({ label: 'Level up', mana: c, sorcery: true, effects: [{ op: 'addC', kind: 'level', n: 1, who: 'self' }] }); return true; }
  if ((m = /^saddle (\d+)$/.exec(p))) { abilities.push({ label: `Saddle ${m[1]}`, crew: +m[1], sorcery: true, effects: [{ op: 'saddled' }] }); return true; }
  if ((m = /^crew (\d+)$/.exec(p))) { abilities.push({ label: `Crew ${m[1]}`, crew: +m[1], effects: [{ op: 'becomes', who: 'self', ce: { addTypes: ['Creature'] }, until: 'eot' }, { op: 'crewed' }] }); return true; }
  if ((m = /^kicker (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.kicker = c; return true; }
  if ((m = /^surge (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.surge = c; return true; }
  if ((m = /^champion (?:an? )?([a-z]+)$/.exec(p))) { const ty = typeWord(m[1]); if (!ty) return false; d.champion = ty; return true; }
  if (p === 'soulbond') { d.soulbond = true; return true; }
  if ((m = /^flashback (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.flashback = c; return true; }
  if ((m = /^(?:(basic land|plains|island|swamp|mountain|forest|land)?)cycling (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p.replace(/^(basic land|plains|island|swamp|mountain|forest)\s?cycling/, '$1cycling')))) {
    const c = parseCost(m[2].toUpperCase()); if (!c) return false;
    const fx: Effect[] = !m[1] ? [{ op: 'draw', n: 1, pl: 'you' }] : [{ op: 'search', n: 1, f: m[1] === 'basic land' ? { types: ['Land'], basic: true } : m[1] === 'land' ? { types: ['Land'] } : { types: [SUB.get(m[1])!] }, dest: 'hand', text: `${m[1]} card` }];
    abilities.push({ label: `${m[1] ? m[1][0].toUpperCase() + m[1].slice(1) : ''}${m[1] ? 'cycling' : 'Cycling'} ${m[2].toUpperCase()}`, mana: c, zone: 'hand', effects: fx }); return true;
  }
  if ((m = /^unearth (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p)) && d.types.includes('Creature')) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; abilities.push({ label: `Unearth ${m[1].toUpperCase()}`, mana: c, zone: 'graveyard', sorcery: true, effects: [{ op: 'unearth' }] }); return true; }
  if (p === 'affinity for artifacts') { const a = forEach('artifact you control', newCx()); if (a === null) return false; d.selfCostLess = { n: 1, per: a }; return true; }
  { const af = /^affinity for (.+)$/.exec(p); if (af) { const a = forEach(af[1], newCx()); if (!a) return false; d.selfCostLess = { n: 1, per: a }; return true; } }
  if (p === 'convoke') { d.convoke = true; return true; }
  if (p === 'rebound' && (d.types.includes('Instant') || d.types.includes('Sorcery'))) { d.rebound = true; return true; }
  if ((m = /^enchant (.+)$/.exec(p))) { const fp = parseFilter(m[1]); if (!fp) return false; d.aura = { who: 'perm', f: fp.f }; return true; }
  if (p === 'partner' || p.startsWith('partner with ') || p === 'friends forever' || p === 'choose a background' || p === "doctor's companion") {
    d.partner = true;
    if ((m = /^partner with (.+)$/.exec(p))) { d.partnerWith = m[1].replace(/\s*\(.*$/, '').trim(); d.partnerKind = 'partnerWith'; }
    else if (p === 'friends forever') d.partnerKind = 'friendsForever';
    else if (p === 'choose a background') d.partnerKind = 'chooseBackground';
    else if (p === "doctor's companion") d.partnerKind = 'doctorsCompanion';
    else d.partnerKind = 'partner';
    return true;
  }
  if (p === '~ can be your commander') { d.canBeCommander = true; return true; }
  if ((m = /^morph (\{[^}]+\})+$/.exec(p))) { const c = parseCost(p.slice(6).toUpperCase()); if (!c) return false; d.morph = c; abilities.push({ label: `Turn face up for ${p.slice(6).toUpperCase()}`, mana: c, morphTurn: true, effects: [] }); return true; }
  if ((m = /^impending (\d+)[—-]((?:\{[^}]+\})+)$/.exec(p))) { const c = parseCost(m[2].toUpperCase()); if (!c) return false; d.impending = { n: +m[1], cost: c }; return true; }
  if ((m = /^toxic (\d+)$/.exec(p))) { kws.add(`toxic ${m[1]}`); return true; }
  if (p === 'riot') { d.riot = true; kws.add('riot'); return true; }
  if (p === 'mentor') { d.mentor = true; return true; }
  if ((m = /^encore (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.encore = c; abilities.push({ label: `Encore ${m[1].toUpperCase()}`, mana: c, zone: 'graveyard', sorcery: true, exileSelf: true, effects: [{ op: 'encore' }] }); return true; }
  if ((m = /^replicate (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.replicate = c; return true; }
  if (p === 'battle cry') { kws.add('battle cry'); return true; }
  if ((m = /^squad (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.squad = c; return true; }
  if ((m = /^multikicker (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.multikicker = (c.generic ?? 0) || 1; return true; }
  if ((m = /^hideaway (\d+)$/.exec(p))) { d.hideaway = +m[1]; return true; }
  if ((m = /^suspend (\d+)[—-]((?:\{[^}]+\})+)$/.exec(p))) { const c = parseCost(m[2].toUpperCase()); if (!c) return false; d.suspend = { n: +m[1], cost: c }; return true; }
  if (p === 'delve') { d.delve = true; return true; }
  if (p === 'retrace' && (d.types.includes('Instant') || d.types.includes('Sorcery'))) { d.retrace = true; return true; }
  if (p === 'living weapon') { d.livingWeapon = true; return true; }
  if ((m = /^echo (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.echo = c; return true; }
  if (p === 'skulk') { kws.add('skulk'); return true; }
  if (p === '~ can block only creatures with flying') { kws.add('_onlyblockflying'); return true; }
  if (p === "creatures with power less than ~'s power can't block it") { kws.add('_noblockltpow'); return true; }
  if (p === 'ascend') { d.ascend = true; return true; }
  if ((m = /^devour (\d+)$/.exec(p))) { d.devour = +m[1]; return true; }
  if ((m = /^backup (\d+)$/.exec(p))) { d.backup = +m[1]; return true; }
  if ((m = /^escape[—\-]?(\{[^}]+\}(?:\{[^}]+\})*), exile (\w+) other cards? from your graveyard$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.escape = { cost: c, n: num(m[2]) as number }; return true; }
  if ((m = /^bestow (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.bestow = c; return true; }
  if (p === 'strive') { d.strive = true; return true; }
  if (p === 'dethrone') { d.dethrone = true; return true; }
  if (p === 'infect') { kws.add('infect'); return true; }
  if ((m = /^poisonous (\d+)$/.exec(p))) { kws.add(`poisonous ${m[1]}`); return true; }
  if ((m = /^bushido (\d+)$/.exec(p))) { kws.add(`bushido ${m[1]}`); return true; }
  if (p === 'flanking') { kws.add('flanking'); return true; }
  if ((m = /^bloodthirst (\d+)$/.exec(p))) { d.bloodthirst = +m[1]; return true; }
  if ((m = /^modular (\d+)$/.exec(p))) { d.modular = +m[1]; d.etbCounters = { kind: '+1/+1', n: +m[1] }; return true; }
  if ((m = /^graft (\d+)$/.exec(p))) { d.graft = +m[1]; d.etbCounters = { kind: '+1/+1', n: +m[1] }; return true; }
  if ((m = /^renown (\d+)$/.exec(p))) { kws.add(`renown ${m[1]}`); return true; }
  if (p === 'unleash') { d.unleash = true; return true; }
  if ((m = /^afterlife (\d+)$/.exec(p))) { kws.add(`afterlife ${m[1]}`); return true; }
  if ((m = /^afflict (\d+)$/.exec(p))) { kws.add(`afflict ${m[1]}`); return true; }
  if ((m = /^fabricate (\d+)$/.exec(p))) { d.fabricate = +m[1]; return true; }
  if ((m = /^offspring (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.offspring = c; return true; }
  if ((m = /^dash (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.dash = c; return true; }
  if (p === 'extort') { d.extort = true; return true; }
  if (p === 'umbra armor' || p === 'totem armor') { kws.add('umbra armor'); return true; }
  if (p === 'enlist') { kws.add('enlist'); return true; }
  if ((m = /^reinforce (\d+)[—-]((?:\{[^}]+\})+)$/.exec(p))) { const c = parseCost(m[2].toUpperCase()); if (!c) return false; abilities.push({ label: `Reinforce ${m[1]}`, mana: c, zone: 'hand', tslots: [{ who: 'perm', f: { types: ['Creature'] }, harm: false }], effects: [{ op: 'addC', kind: '+1/+1', n: +m[1], who: 't0' }] }); return true; }
  if (p === 'training') { kws.add('training'); return true; }
  if ((m = /^rampage (\d+)$/.exec(p))) { kws.add(`rampage ${m[1]}`); return true; }
  if (p === 'provoke') { kws.add('provoke'); return true; }
  if (p === 'ingest') { kws.add('ingest'); return true; }
  if ((m = /^amplify (\d+)$/.exec(p))) { d.amplify = +m[1]; return true; }
  if (p === 'for mirrodin!') { d.forMirrodin = true; return true; }
  if ((m = /^buyback (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.buyback = c; return true; }
  if (p === 'jump-start') { d.jumpStart = true; return true; }
  if ((m = /^madness (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.madness = c; return true; }
  if ((m = /^miracle (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.miracle = c; return true; }
  if ((m = /^entwine (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.entwine = c; return true; }
  if (p === 'conspire') { d.conspire = true; return true; }
  if (p === 'assist') { d.assist = true; return true; }
  if ((m = /^soulshift (\d+)$/.exec(p))) { d.soulshift = +m[1]; return true; }
  if (p === 'bargain') { d.bargain = true; return true; }
  if (p === 'exploit') { d.exploit = true; return true; }
  if (p === 'split second') { d.splitSecond = true; kws.add('split second'); return true; }
  if (p === 'storm') { d.storm = true; return true; }
  if ((m = /^casualty (\d+)$/.exec(p))) { d.casualty = +m[1]; return true; }
  if ((m = /^spectacle (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.spectacle = c; return true; }
  if ((m = /^blitz (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.blitz = c; return true; }
  if ((m = /^freerunning (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.freerunning = c; return true; }
  if ((m = /^emerge (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.emerge = c; return true; }
  if ((m = /^recover (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.recover = c; return true; }
  if ((m = /^transmute (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) {
    const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.transmute = c;
    abilities.push({ label: `Transmute ${m[1].toUpperCase()}`, mana: c, zone: 'hand', sorcery: true, discard: 0, effects: [{ op: 'script', kind: 'transmute' }] });
    return true;
  }
  if ((m = /^tribute (\d+)$/.exec(p))) { d.tribute = +m[1]; return true; }
  if ((m = /^splice onto ([a-z][a-z ]*?) (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) {
    const c = parseCost(m[2].toUpperCase()); if (!c) return false; d.splice = { onto: m[1].trim().replace(/\b\w/g, ch => ch.toUpperCase()), cost: c }; return true;
  }
  if ((m = /^ward[—\-]sacrifice (?:a |an )?(.+)$/.exec(p))) {
    const fp = parseFilter(m[1]); d.wardSac = fp?.f ?? { types: [/creature/.test(m[1]) ? 'Creature' : /permanent/.test(m[1]) ? undefined : undefined].filter(Boolean) as string[] };
    if (!d.wardSac.types?.length && /permanent/.test(m[1])) delete d.wardSac.types;
    if (!d.wardSac.types?.length && !d.wardSac.anyType) d.wardSac = { types: ['Creature'] };
    return true;
  }
  if ((m = /^ward[—\-]discard (?:a |an )?card$/.exec(p))) { d.wardDiscard = 1; return true; }
  if ((m = /^ward[—\-]exile (\w+) cards? from your graveyard$/.exec(p))) { const n = num(m[1]); d.wardExileGy = typeof n === 'number' ? n : 1; return true; }
  if (p === 'imprint') { d.imprint = true; return true; }
  if (p === 'read ahead') { d.readAhead = true; return true; }
  { const em = /^escalate \{([wubrgc])\}$/.exec(p); if (em) { const k = em[1].toUpperCase() as 'W'|'U'|'B'|'R'|'G'|'C'; d.escalateCost = { generic: 0, [k]: 1 }; return true; } }
  if (p === 'gift a card') { d.gift = 'card'; return true; }
  { const wl = /^ward[—\-]pay (\d+) life$/.exec(p); if (wl) { d.wardLife = +wl[1]; return true; } }
  if ((m = /^plot (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.plot = c; return true; }
  if ((m = /^awaken (\d+)[—\-](\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) { const c = parseCost(m[2].toUpperCase()); if (!c) return false; d.awaken = { n: +m[1], cost: c }; return true; }
  if ((m = /^scavenge (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) {
    const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.scavenge = c;
    abilities.push({ label: `Scavenge ${m[1].toUpperCase()}`, mana: c, zone: 'graveyard', sorcery: true, exileSelf: true, tslots: [{ who: 'perm', f: { types: ['Creature'] }, harm: false }], effects: [{ op: 'script', kind: 'scavenge' }] });
    return true;
  }
  if ((m = /^prototype (\{[^}]+\}(?:\{[^}]+\})*) [—\-] (\d+)\/(\d+)$/.exec(p))) {
    const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.prototype = { cost: c, power: +m[2], toughness: +m[3] }; return true;
  }
  if (p === 'fuse') { d.fuse = true; return true; }
  if (p === 'aftermath') { d.aftermath = true; return true; }
  if (p === 'cipher') { d.cipher = true; return true; }
  if ((m = /^fading (\d+)$/.exec(p))) { d.fading = +m[1]; return true; }
  if ((m = /^vanishing (\d+)$/.exec(p))) { d.vanishing = +m[1]; return true; }
  if ((m = /^embalm (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) {
    const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.embalm = c;
    abilities.push({ label: `Embalm ${m[1].toUpperCase()}`, mana: c, zone: 'graveyard', sorcery: true, exileSelf: true, effects: [{ op: 'script', kind: 'embalm' }] });
    return true;
  }
  if ((m = /^eternalize (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) {
    const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.eternalize = c;
    abilities.push({ label: `Eternalize ${m[1].toUpperCase()}`, mana: c, zone: 'graveyard', sorcery: true, exileSelf: true, effects: [{ op: 'script', kind: 'eternalize' }] });
    return true;
  }
  if (p === 'learn') { d.learn = true; return true; }
  if ((m = /^outlast (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) {
    const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.outlast = c;
    abilities.push({ label: `Outlast ${m[1].toUpperCase()}`, mana: c, tap: true, sorcery: true, effects: [{ op: 'addC', kind: '+1/+1', n: 1, who: 'self' }] });
    return true;
  }
  if ((m = /^cumulative upkeep (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) {
    const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.cumUpkeep = c; return true;
  }
  if ((m = /^disguise (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) {
    const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.morph = c; d.disguise = true;
    abilities.push({ label: `Turn face up for ${m[1].toUpperCase()}`, mana: c, morphTurn: true, effects: [] });
    return true;
  }
  if ((m = /^megamorph (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) {
    const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.morph = c; d.megamorph = true;
    abilities.push({ label: `Turn face up for ${m[1].toUpperCase()}`, mana: c, morphTurn: true, effects: [] });
    return true;
  }
  if ((m = /^cloak (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(p))) {
    const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.morph = c; d.disguise = true; return true;
  }
  if ((m = /^protection from (.+)$/.exec(p)) && p !== 'protection from everything') {
    // typal / quality protection (colors and 'creatures' / 'multicolored' already handled above)
    kws.add('protection from ' + m[1].replace(/s$/, '').replace(/planeswalkers?/, 'planeswalker').replace(/dragons?/, 'dragon'));
    // keep the raw phrase too so "protection from dragons" and "protection from dragon" both match
    kws.add('protection from ' + m[1]);
    return true;
  }
  if (p === 'demonstrate' || p === 'myriad' || p === 'gravestorm' || /^annihilator \d+$/.test(p) || p === 'populate') return false;
  void sc; return false;
}
function parseAltCost(s: string, d: CardDef): boolean {
  let m: RegExpExecArray | null;
  const tail = / rather than pay (?:this spell's|~'s) mana cost(?: if .+)?$/;
  if (!tail.test(s) && !/ rather than pay the mana cost for /.test(s)) return false;
  if ((m = /^you may exile (a|an|one|two|three|\d+) (white|blue|black|red|green) cards? from your hand rather than pay (?:this spell's|~'s) mana cost$/.exec(s))) {
    const n0 = num(m[1]); if (typeof n0 !== 'number') return false;
    d.exileAlt = { n: n0, color: COLOR_OF[m[2]] }; return true;
  }
  if ((m = /^if it's not your turn, you may exile (a|an|one|two|three|\d+) (white|blue|black|red|green) cards? from your hand rather than pay (?:this spell's|~'s) mana cost$/.exec(s))) {
    const n0 = num(m[1]); if (typeof n0 !== 'number') return false;
    d.exileAlt = { n: n0, color: COLOR_OF[m[2]], cond: { k: 'notYourTurn' } }; return true;
  }
  if ((m = /^you may pay (\d+) life and exile (a|an|one|two|three|\d+) (white|blue|black|red|green) cards? from your hand rather than pay (?:this spell's|~'s) mana cost$/.exec(s))) {
    const life = +m[1]; const n0 = num(m[2]); if (typeof n0 !== 'number') return false;
    d.exileAlt = { n: n0, color: COLOR_OF[m[3]], life }; return true;
  }
  if ((m = /^you may pay (\{[^}]+\}(?:\{[^}]+\})*) rather than pay (?:this spell's|~'s) mana cost$/.exec(s))) {
    const c = parseCost(m[1].toUpperCase()); if (!c) return false; d.altCost = { mana: c }; return true;
  }
  if ((m = /^you may pay (\{[^}]+\}(?:\{[^}]+\})*) rather than pay (?:this spell's|~'s) mana cost if (.+)$/.exec(s))) {
    const c = parseCost(m[1].toUpperCase()); const cc = cond(m[2], newCx()); if (!c || !cc) return false; d.altCost = { mana: c, cond: cc }; return true;
  }
  if ((m = /^you may pay (\{[^}]+\}(?:\{[^}]+\})*) and return (a|an|one|two|three|\d+) (.+?) you control to (?:its|their) owner's hand rather than pay (?:this spell's|~'s) mana cost$/.exec(s))) {
    const c = parseCost(m[1].toUpperCase()); const n0 = num(m[2]); const fp = parseFilter(m[3]);
    if (!c || typeof n0 !== 'number' || !fp || fp.card) return false;
    d.altCost = { mana: c, retF: { f: fp.f, n: n0 } }; return true;
  }
  if ((m = /^you may return (a|an|one|two|three|\d+) (.+?) you control to (?:its|their) owner's hand rather than pay (?:this spell's|~'s) mana cost$/.exec(s))) {
    const n0 = num(m[1]); const fp = parseFilter(m[2]);
    if (typeof n0 !== 'number' || !fp || fp.card) return false;
    d.altCost = { retF: { f: fp.f, n: n0 } }; return true;
  }
  if ((m = /^you may sacrifice (a|an|one|two|three|\d+) (.+?) rather than pay (?:this spell's|~'s) mana cost$/.exec(s))) {
    const n0 = num(m[1]); const fp = parseFilter(m[2]);
    if (typeof n0 !== 'number' || !fp || fp.card) return false;
    d.altCost = { sacF: { f: fp.f, n: n0 } }; return true;
  }
  if ((m = /^if you control an? (.+?), you may tap an? (untapped )?(.+?) you control rather than pay (?:this spell's|~'s) mana cost$/.exec(s))) {
    const cc = cond('you control a ' + m[1], newCx()); const fp = parseFilter((m[2] ? 'untapped ' : '') + m[3]);
    if (!cc || !fp || fp.card) return false;
    d.altCost = { cond: cc, tapF: { f: fp.f, n: 1 } }; return true;
  }
  if ((m = /^if you control an? (.+?), you may sacrifice an? (.+?) rather than pay (?:this spell's|~'s) mana cost$/.exec(s))) {
    const cc = cond('you control a ' + m[1], newCx()); const fp = parseFilter(m[2]);
    if (!cc || !fp || fp.card) return false;
    d.altCost = { cond: cc, sacF: { f: fp.f, n: 1 } }; return true;
  }
  return false;
}



/** Parse a standalone “if … would …, … instead” line. Fail-closed on unknown events or tails. */
function parseReplacement(s: string, cond?: Cond): Replacement | null {
  let m: RegExpExecArray | null;
  const withCond = (r: Replacement): Replacement => cond ? { ...r, cond } : r;

  // self: if ~ would be put into a graveyard from anywhere, exile it instead
  if (/^if ~ would be put into a graveyard from anywhere, exile it instead$/.test(s))
    return withCond({ ev: 'toGy', self: true, fromAnywhere: true, zoneChange: true, instead: { k: 'exile' }, text: s });
  if (/^if ~ would be put into a graveyard from anywhere, reveal ~ and shuffle it into its owner's library instead$/.test(s))
    return withCond({ ev: 'toGy', self: true, fromAnywhere: true, zoneChange: true, instead: { k: 'shuffle' }, text: s });
  if (/^if ~ would die, exile it instead$/.test(s))
    return withCond({ ev: 'die', self: true, zoneChange: true, instead: { k: 'exile' }, text: s });

  // a creature dealt damage by ~ this turn would die, exile it instead
  if (/^if a creature dealt damage by ~ this turn would die, exile it instead$/.test(s))
    return withCond({ ev: 'die', f: { types: ['Creature'] }, bySrc: true, zoneChange: true, instead: { k: 'exile' }, text: s });
  // a [filter] would die, exile it instead
  if ((m = /^if ((?:an?|one) .+?) would die, exile (?:it|that creature|that permanent) instead$/.exec(s))) {
    if (/dealt damage/.test(m[1])) return null;
    const fp = parseFilter(m[1].replace(/^(?:an?|one) /, '')); if (!fp) return null;
    return withCond({ ev: 'die', f: fp.f, zoneChange: true, instead: { k: 'exile' }, text: s });
  }

  // cards/tokens into a graveyard from anywhere
  if (/^if a card or token would be put into your graveyard from anywhere, exile it instead$/.test(s)
    || /^if a card or token would be put into a graveyard from anywhere, exile it instead$/.test(s)) {
    const pl: Replacement['pl'] = /your graveyard/.test(s) ? 'you' : 'any';
    return withCond({ ev: 'toGy', fromAnywhere: true, pl, zoneChange: true, instead: { k: 'exile' }, text: s });
  }
  if (/^if a card would be put into your graveyard from anywhere(?: this turn)?, exile that card instead$/.test(s))
    return withCond({ ev: 'toGy', fromAnywhere: true, pl: 'you', cardsOnly: true, zoneChange: true, instead: { k: 'exile' }, thisTurn: /this turn/.test(s), text: s });

  // tokens (plain “twice that many tokens” stays on the tokenDouble static so every tokMul caller still sees it)
  if (/^if you would create one or more treasure tokens, instead create those tokens plus an additional treasure token$/.test(s))
    return withCond({ ev: 'token', pl: 'you', tokenF: { types: ['Treasure'] }, instead: { k: 'plusToken', preset: 'Treasure' }, text: s });

  // counters
  if ((m = /^if one or more \+1\/\+1 counters would be put on (?:a |an )?(.+?), twice that many \+1\/\+1 counters are put on that (?:creature|permanent) instead$/.exec(s))) {
    const fp = parseFilter(m[1]); if (!fp) return null;
    return withCond({ ev: 'counters', f: fp.f, ctrKind: '+1/+1', instead: { k: 'mul', n: 2 }, text: s });
  }
  if (/^if an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead$/.test(s))
    return withCond({ ev: 'counters', f: { ctrl: 'you' }, instead: { k: 'mul', n: 2 }, text: s });
  if (/^if you would put one or more counters on a permanent or player, put twice that many of each of those kinds of counters on that permanent or player instead$/.test(s))
    return withCond({ ev: 'counters', ctrYou: true, instead: { k: 'mul', n: 2 }, text: s });
  if (/^if you would put one or more counters on a creature you control, put twice that many of each of those kinds of counters on that creature instead$/.test(s))
    return withCond({ ev: 'counters', f: { types: ['Creature'], ctrl: 'you' }, ctrYou: true, instead: { k: 'mul', n: 2 }, text: s });

  // life / draw
  if (/^if you would gain life, you gain twice that much life instead$/.test(s))
    return withCond({ ev: 'gainLife', pl: 'you', instead: { k: 'mul', n: 2 }, text: s });
  if (/^if you would gain life, draw that many cards instead$/.test(s))
    return withCond({ ev: 'gainLife', pl: 'you', instead: { k: 'drawInstead' }, text: s });
  if (/^if you would draw a card, draw two cards instead$/.test(s))
    return withCond({ ev: 'draw', pl: 'you', instead: { k: 'mul', n: 2 }, text: s });
  if (/^if you would draw a card except the first one you draw in each of your draw steps, draw two cards instead$/.test(s))
    return null; // kept as the existing doubleDraw static (first-draw-step exception)

  // damage
  if (/^damage that would reduce your life total to less than 1 reduces it to 1 instead$/.test(s))
    return withCond({ ev: 'damage', pl: 'you', instead: { k: 'floorLife', n: 1 }, text: s });
  if (/^all damage that would be dealt to you is dealt to ~ instead$/.test(s))
    return withCond({ ev: 'damage', pl: 'you', instead: { k: 'redirect', to: 'self' }, text: s });
  if (/^all damage that would be dealt to you is dealt to enchanted creature instead$/.test(s))
    return withCond({ ev: 'damage', pl: 'you', instead: { k: 'redirect', to: 'attached' }, text: s });
  if (/^all damage that would be dealt to you and other permanents you control is dealt to ~ instead$/.test(s))
    return withCond({ ev: 'damage', pl: 'you', instead: { k: 'redirect', to: 'self' }, text: s }); // permanents-you-control half: also match via f on the permanent
  // Handle "you and other permanents you control" as two replacements
  if (/^all damage that would be dealt to you and other permanents you control is dealt to ~ instead$/.test(s))
    return withCond({ ev: 'damage', pl: 'you', instead: { k: 'redirect', to: 'self' }, text: s });
  if (/^if a source would deal damage to a permanent or player, it deals double that damage to that permanent or player instead$/.test(s))
    return withCond({ ev: 'damage', instead: { k: 'mul', n: 2 }, text: s });
  if ((m = /^if another ([a-z]+) source you control would deal damage to a permanent or player, it deals that much damage plus 1 to that permanent or player instead$/.exec(s))) {
    const col = COLOR_OF[m[1]]; if (!col) return null;
    return withCond({ ev: 'damage', srcYou: true, srcOther: true, colors: [col], instead: { k: 'plus', n: 1 }, text: s });
  }
  if (/^if another source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 1 instead$/.test(s))
    return null; // existing dmgPlus1 static

  // extra turns
  if (/^if a player would begin an extra turn, that player skips that turn instead$/.test(s))
    return withCond({ ev: 'extraTurn', pl: 'any', instead: { k: 'skip' }, text: s });
  if (/^if an opponent would begin an extra turn, that player skips that turn instead$/.test(s))
    return withCond({ ev: 'extraTurn', pl: 'opp', instead: { k: 'skip' }, text: s });

  if (/^if you would draw a card while you have no cards in hand, draw two cards instead$/.test(s))
    return withCond({ ev: 'draw', pl: 'you', cond: { k: 'noCardsHand' }, instead: { k: 'mul', n: 2 }, text: s });
  if (/^if you would gain life while you have 5 or less life, you gain twice that much life instead$/.test(s))
    return withCond({ ev: 'gainLife', pl: 'you', cond: { k: 'lifeLE', n: 5 }, instead: { k: 'mul', n: 2 }, text: s });

  return null;
}

function parseReplacementLine(s: string, d: CardDef, cond?: Cond): boolean {
  // “you and other permanents you control” is two replacements (player + permanents).
  if (/^all damage that would be dealt to you and other permanents you control is dealt to ~ instead$/.test(s)) {
    const a: Replacement = { ev: 'damage', pl: 'you', instead: { k: 'redirect', to: 'self' }, text: s, cond };
    const b: Replacement = { ev: 'damage', f: { ctrl: 'you', other: true }, instead: { k: 'redirect', to: 'self' }, text: s, cond };
    (d.replacements ??= []).push(a, b);
    return true;
  }
  const r = parseReplacement(s, cond);
  if (!r) return false;
  (d.replacements ??= []).push(r);
  return true;
}


function parseTypeWords(s: string): { addTypes?: string[]; addSub?: string[] } | null {
  const addTypes: string[] = []; const addSub: string[] = [];
  for (const w of s.split(/\s+/).filter(Boolean)) {
    const lower = w.toLowerCase();
    if (lower === 'legendary') continue;
    if (TYPES[lower] && !['Permanent', 'Legendary', 'Historic', 'Outlaw'].includes(TYPES[lower])) addTypes.push(TYPES[lower]);
    else if (SUB.has(lower)) addSub.push(SUB.get(lower)!);
    else return null;
  }
  if (!addTypes.length && !addSub.length) return null;
  return { addTypes: addTypes.length ? addTypes : undefined, addSub: addSub.length ? addSub : undefined };
}
/** Modelable CR 707 except-clauses only; anything else is fail-closed. */
function parseCopyExcept(s: string | undefined): { addTypes?: string[]; addSub?: string[]; nonlegendary?: boolean; name?: string } | 'fail' | undefined {
  if (!s) return undefined;
  const t0 = s.trim().replace(/\.$/, '').replace(/^except (?:it's |it )?/i, '');
  const parts = t0.split(/, and | and /).map(x => x.trim()).filter(Boolean);
  const out: { addTypes?: string[]; addSub?: string[]; nonlegendary?: boolean; name?: string } = {};
  for (const part of parts) {
    const add = /^(?:an? )?(.+?) in addition to its other types$/.exec(part);
    if (add) {
      const tw = parseTypeWords(add[1]); if (!tw) return 'fail';
      if (tw.addTypes) out.addTypes = [...(out.addTypes ?? []), ...tw.addTypes];
      if (tw.addSub) out.addSub = [...(out.addSub ?? []), ...tw.addSub];
      continue;
    }
    if (/^(?:it )?(?:not legendary|isn't legendary)$/.test(part)) { out.nonlegendary = true; continue; }
    if (/^(?:his|her|its) name is ~$/.test(part) || (CUR_NAME && part === `its name is ${CUR_NAME.toLowerCase()}`)) { out.name = CUR_NAME; continue; }
    return 'fail';
  }
  return out;
}
function copyOfFilter(s: string): { f: import('./types').Filter; zone?: 'graveyard' | 'battlefield' } | null {
  let t1 = s.trim().replace(/^any /, '').replace(/^(?:an?|one) /, '');
  let zone: 'graveyard' | 'battlefield' | undefined;
  if (/\s+in (?:a|your) graveyard$/.test(t1)) { t1 = t1.replace(/\s+in (?:a|your) graveyard$/, ''); zone = 'graveyard'; }
  else if (/\s+on the battlefield$/.test(t1)) { t1 = t1.replace(/\s+on the battlefield$/, ''); zone = 'battlefield'; }
  const fp = parseFilter(t1);
  if (!fp) return null;
  return { f: fp.f, zone };
}
function parseEnterAsCopy(l: string, d: CardDef): boolean {
  let may = false; let tapped = false; let rest = '';
  let m: RegExpExecArray | null;
  if ((m = /^(?:you may have )?~ enter(?:s)?(?: the battlefield)?( tapped)? as a copy of (.+)$/.exec(l))) {
    may = /^you may have /.test(l);
    tapped = !!m[1];
    rest = m[2];
  } else if ((m = /^as ~ enters(?: the battlefield)?, you may have it (?:enter as|be) a copy of (.+)$/.exec(l))) {
    may = true; rest = m[1];
  } else return false;
  let exceptRaw: string | undefined;
  const exm = /^(.*?), except (.+)$/.exec(rest);
  if (exm) { rest = exm[1]; exceptRaw = 'except ' + exm[2]; }
  const of = copyOfFilter(rest);
  if (!of) return false;
  const ex = parseCopyExcept(exceptRaw);
  if (ex === 'fail') return false;
  (d.asEnters ??= []).push({ op: 'enterCopy', f: of.f, zone: of.zone ?? 'battlefield', may, tapped: tapped || undefined, except: ex });
  return true;
}

export function staticLine(l: string, d: CardDef, statics: Static[], kws: Set<string>): boolean {
  let m: RegExpExecArray | null; let c: Cond | undefined; let s = l;
  if (parseEnterAsCopy(s, d)) return true;
  if (/^if it's neither day nor night, it becomes day as ~ enters$/.test(s)) { d.dayAsEnters = true; return true; }
  if (parseAltCost(s, d)) return true;
  if (/^gift a card$/.test(s)) { d.gift = 'card'; return true; }
  { const em = /^escalate \{([wubrgc])\}$/.exec(s); if (em) { const k = em[1].toUpperCase() as 'W'|'U'|'B'|'R'|'G'|'C'; d.escalateCost = { generic: 0, [k]: 1 }; return true; } }

  if (/^you don't lose unspent red mana as steps and phases end$/.test(s)) { statics.push({ k: 'manaPersistColor', who: 'self', color: 'R' }); return true; }
  if (/^you may cast green creature spells as though they had flash$/.test(s)) { statics.push({ k: 'flashSpell', who: 'self', spellF: { types: ['Creature'], colors: ['G'] } }); return true; }
  if (/^you may cast artifact spells as though they had flash$/.test(s)) { statics.push({ k: 'flashSpell', who: 'self', spellF: { types: ['Artifact'] } }); return true; }
  if (/^you may cast (?:this spell|~) as though it had flash$/.test(s)) { kws.add('flash'); d.keywords = [...kws]; return true; }
  if ((m = /^you may cast (.+?) spells as though they had flash$/.exec(s))) {
    const fp = parseFilter(m[1]); if (!fp || fp.card) return false;
    statics.push({ k: 'flashSpell', who: 'self', spellF: fp.f }); return true;
  }
  if (/^you control enchanted (?:creature|permanent|land|artifact|planeswalker)$/.test(s)) { statics.push({ k: 'controlAttached', who: 'attached' }); return true; }
  if (/^if (?:~|this card) is in your opening hand, you may begin the game with (?:it|this card|~) on the battlefield$/.test(s)) { d.leyline = true; return true; }
  if (/^if (?:~|this card) is in your opening hand and you're not the starting player, you may begin the game with (?:it|this card|~) on the battlefield with a luck counter on it\. if you do, exile a card from your hand$/.test(s)) { d.leyline = true; d.leylineLuck = true; return true; }
  if (/^if ~ would enter, you may discard a land card instead\. if you do, put ~ onto the battlefield\. if you don't, put it into its owner's graveyard$/.test(s)) { d.enterDiscardLand = true; return true; }
  if ((m = /^each land is an? (plains|island|swamp|mountain|forest) in addition to its other (?:land )?types$/.exec(s))) { statics.push({ k: 'addLandType', who: 'all', f: { types: ['Land'] }, add: [m[1][0].toUpperCase() + m[1].slice(1)] }); return true; }
  if (/^creature spells you control can't be countered$/.test(s)) { statics.push({ k: 'spellsUncounterable', who: 'self', spellF: { types: ['Creature'] } }); return true; }
  if (/^during your turn, your opponents can't cast spells or activate abilities of artifacts, creatures, or enchantments$/.test(s)) { statics.push({ k: 'oppsCantCast', who: 'self' }, { k: 'oppsCantAct', who: 'self' }); return true; }
  if ((m = /^whenever enchanted land is tapped for mana, its controller adds an additional \{([wubrgc])\}$/.exec(s))) { statics.push({ k: 'manaExtra', who: 'attached', add: [m[1].toUpperCase()] }); return true; }
  if (/^cast (?:this spell|~) only during the declare attackers step(?: and only if you've been attacked this step)?$/.test(s)) { d.castOnly = 'declareAttackers'; return true; }
  if (/^cast (?:this spell|reset|~) only during an opponent's turn after (?:their|his or her) upkeep step$/.test(s)) { d.castOnly = 'afterOppUpkeep'; return true; }
  if (/^goaded creatures can't block$/.test(s)) { statics.push({ k: 'goadedCantBlock', who: 'all' }); return true; }
  if (/^~ can't attack alone$/.test(s) && !c) { d.noAtkAlone = true; return true; }
  if (/^~ can't block alone$/.test(s) && !c) { d.noBlockAlone = true; return true; }
  if (/^~ can't attack or block alone$/.test(s) && !c) { d.noAtkAlone = true; d.noBlockAlone = true; return true; }
  if ((m = /^~ can't be blocked except by two or more creatures$/.exec(s))) { statics.push({ k: 'blockMin2', who: 'self', cond: c }); return true; }
  if ((m = /^~ can't be blocked except by (.+)$/.exec(s))) { const fp = parseFilter(m[1].replace(/^creatures /, 'creature ')); if (!fp) return false; statics.push({ k: 'blockOnlyBy', who: 'self', spellF: fp.f, cond: c }); return true; }
  if ((m = /^~ can't attack unless (?:the )?defending player controls (?:an? )?(.+)$/.exec(s))) { const fp = parseFilter(m[1]); if (!fp) return false; d.atkUnlessDef = fp.f; return true; }
  if ((m = /^(.+) can't be blocked by more than one creature$/.exec(s))) {
    if (m[1] === '~') { statics.push({ k: 'blockMax1', who: 'self', cond: c }); return true; }
    const fp = parseFilter(m[1]); if (!fp) return false; statics.push({ k: 'blockMax1', who: 'all', f: fp.f, cond: c }); return true;
  }
  if ((m = /^you can't cast ~ during your first, second, or third turns of the game$/.exec(s))) { d.noCastTurns = 3; return true; }
  if ((m = /^each other ([a-z]+) you control enters with an additional \+1\/\+1 counter on it for each \1 you already control$/.exec(s))) {
    const ty = m[1][0].toUpperCase() + m[1].slice(1);
    statics.push({ k: 'etbTypalCtr', who: 'self', f: { types: [ty] }, kws: [ty] });
    return true;
  }
  if ((m = /^each ([a-z]+) you control enters with an additional \+1\/\+1 counter on it$/.exec(s))) {
    const ty = m[1][0].toUpperCase() + m[1].slice(1);
    statics.push({ k: 'etbTypalCtr', who: 'self', f: { types: [ty] }, n: 1 });
    return true;
  }
  if (/^each creature you control with power 4 or greater can't be blocked by more than one creature$/.test(s)) { statics.push({ k: 'blockMax1', who: 'all', f: { types: ['Creature'], ctrl: 'you', powGE: 4 } }); return true; }
  if (/^as long as ~ is in your graveyard and you control a mountain, creatures you control have haste$/.test(s)) { d.gyHaste = true; return true; }
  if (/^as long as ~ is paired with another creature, each of those creatures has "whenever ~ deals damage to an opponent, draw a card\.?"$/.test(s)) { statics.push({ k: 'soulDraw', who: 'self' }); return true; }
  const cm = /^(.+?) as long as (.+)$/.exec(s) ?? /^as long as (.+?), (.+)$/.exec(s);
  if (cm) { const [body, cs] = s.startsWith('as long as') ? [cm[2], cm[1]] : [cm[1], cm[2]]; const cc = cond(cs, newCx()); if (!cc) return false; c = cc; s = body.replace(/^it (has|gets|can't)\b/, '~ $1'); }
  const dm = /^during your turn, (.+)$/.exec(s); if (dm) { c = { k: 'yourTurn' }; s = dm[1]; }
  if (parseReplacementLine(s, d, c)) return true;
  { const um = /^(~ can't attack or block|~ can't attack|~ can't block) unless (.+)$/.exec(s); if (um && !c) { const cc = cond(um[2], newCx()); if (!cc) return false; const nc: Cond = { k: 'not', c: cc } as Cond; const ks: Static['k'][] = um[1].endsWith('attack or block') ? ['cantAttack', 'cantBlock'] : um[1].endsWith('attack') ? ['cantAttack'] : ['cantBlock']; for (const k of ks) statics.push({ k, who: 'self', cond: nc }); return true; } }
  if (/^~ enters tapped$/.test(s) && !c) { d.etbTapped = true; return true; }
  if ((m = /^(?:~|this (?:creature|artifact|permanent)) enters tapped with (a|an|one|two|three|four|five|six|\d+) ([a-z+-\/]+) counters? on it$/.exec(s))) {
    const n = num(m[1]); if (typeof n !== 'number') return false;
    d.etbTapped = true; d.etbCounters = { kind: m[2], n }; return true;
  }
  if (/^nonbasic lands don't untap during their controllers' untap steps$/.test(s) && !c) { statics.push({ k: 'doesntUntap', who: 'all', f: { types: ['Land'], nonbasic: true } }); return true; }
  if (/^nonbasic lands are islands$/.test(s) && !c) { statics.push({ k: 'areIsland', who: 'self' }); return true; }
  if (/^you may cast spells from your hand without paying their mana costs$/.test(s) && !c) { statics.push({ k: 'omni', who: 'self' }); return true; }
  if (/^you may look at the top card of your library any time$/.test(s) && !c) { statics.push({ k: 'topLook', who: 'self' }); return true; }
  if (/^play with the top card of your library revealed$/.test(s) && !c) { statics.push({ k: 'topLook', who: 'self' }); return true; }
  if (/^lands you control enter untapped$/.test(s) && !c) { statics.push({ k: 'landsUntapped', who: 'self' }); return true; }
  if (/^you may cast artifact spells and colorless spells from the top of your library$/.test(s) && !c) { statics.push({ k: 'topCast', who: 'self', spellF: { artOrColorless: true } }); return true; }
  if ((m = /^you may cast (.+?) spells from the top of your library$/.exec(s)) && !c) { const fp = parseFilter(m[1] + ' spell'); if (!fp) return false; statics.push({ k: 'topCast', who: 'self', spellF: fp.f }); return true; }
  if ((m = /^spells your opponents cast that target a (.+?) you control cost \{(\d+)\} more to cast$/.exec(s)) && !c) { const fp = parseFilter(m[1]); if (!fp) return false; statics.push({ k: 'taxSpell', who: 'self', n: +m[2], spellF: fp.f }); return true; }
  if ((m = /^abilities your opponents activate that target a (.+?) you control cost \{(\d+)\} more to activate$/.exec(s)) && !c) { const fp = parseFilter(m[1]); if (!fp) return false; statics.push({ k: 'taxAct', who: 'self', n: +m[2], spellF: fp.f }); return true; }
  if ((m = /^the first instant or sorcery spell you cast each turn costs \{([wubrg])\} less to cast for each (.+)$/.exec(s)) && !c) { const per = forEach(m[2], newCx()); if (!per) return false; statics.push({ k: 'pipLess', who: 'self', color: m[1].toUpperCase() as Color, p: per }); return true; }
  if ((m = /^as an additional cost to cast (?:this spell|~), sacrifice an? (.+?) or pay \{(\d+)\}$/.exec(s))) { const fp = parseFilter(m[1]); if (!fp) return false; d.costOr = { sacF: { f: fp.f, n: 1 }, pay: +m[2] }; return true; }
  if ((m = /^as an additional cost to cast (?:this spell|~), discard a card or pay (\d+) life$/.exec(s))) { d.discardOrLife = { life: +m[1], discard: 1 }; return true; }
  if ((m = /^([a-z]+) spells and ([a-z]+) spells you cast cost \{(\d+)\} less to cast$/.exec(s))) { const a = typeWord(m[1]); const b = typeWord(m[2]); if (!a || !b) return false; statics.push({ k: 'costLess', who: 'all', n: +m[3], spellF: { anyType: [a, b] } }); return true; }
  if ((m = /^instant and sorcery spells you cast cost \{(\d+)\} less to cast$/.exec(s))) { statics.push({ k: 'costLess', who: 'all', n: +m[1], spellF: { anyType: ['Instant', 'Sorcery'] } }); return true; }
  if (!c && /^if another source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 1 instead$/.test(s)) { statics.push({ k: 'dmgPlus1', who: 'self' }); return true; }
  if (!c && /^if equipped creature would be dealt damage, prevent that damage and put that many \+1\/\+1 counters on it$/.test(s)) { statics.push({ k: 'preventToAttachedCtr', who: 'attached' }); return true; }
  if (!c && (m = /^if a source an opponent controls would deal damage to you, prevent (\d+) of that damage$/.exec(s))) { statics.push({ k: 'preventOppToYou', who: 'self', n: +m[1] }); return true; }
  if ((m = /^as ~ enters, you may pay (\d) life\. if you don't, it enters tapped$/.exec(s))) { d.shock = +m[1]; return true; }
  if ((m = /^as ~ enters, you may reveal an? (\w+) or (\w+) card from your hand\. if you don't, ~ enters tapped$/.exec(s)) && typeWord(m[1]) && typeWord(m[2])) { d.etbTappedUnless = { k: 'handHas', f: { anyType: [typeWord(m[1])!, typeWord(m[2])!] } }; return true; }
  if ((m = /^as ~ enters, you may reveal an? (\w+) card from your hand\. if you don't, ~ enters tapped$/.exec(s)) && typeWord(m[1])) { d.etbTappedUnless = { k: 'handHas', f: { anyType: [typeWord(m[1])!] } }; return true; }
  if (/^as ~ enters, choose a creature type$/.test(s) && !c) { d.chooseType = true; return true; }
  if (/^as ~ enters, choose a color$/.test(s) && !c) { d.chooseColor = true; return true; }
  if (/^spells and abilities can't be countered$/.test(s) && !c) { statics.push({ k: 'noCounter', who: 'self' }); return true; }
  if (/^damage can't be prevented$/.test(s) && !c) { statics.push({ k: 'noPrevent', who: 'self' }); return true; }
  if (/^~ is the chosen type in addition to its other types$/.test(s) && !c) { d.addChosen = true; return true; }
  if ((m = /^(each other |other )?(.+?) enters? with an additional ([+-]\d\/[+-]\d|[a-z]+) counter on (?:it|them)$/.exec(s)) && !c) { const fp = parseFilter(m[2]); if (!fp || fp.card || fp.spell) return false; statics.push({ k: 'etbExtra', who: 'all', f: { ...fp.f, other: m[1] ? true : undefined }, kws: [m[3]], n: 1 }); return true; }
  if ((m = /^~ enters tapped unless (.+)$/.exec(s))) { const t = m[1].replace(/^you have two or more opponents$/, '§opp'); const cc: Cond | null = t === '§opp' ? { k: 'oppsGE', n: 2 } : cond(t, newCx()); if (!cc) return false; d.etbTappedUnless = cc; return true; }
  if (/^~ can block an additional (creature|creature or planeswalker) each combat$/.test(s) || /^~ can block an additional creature each combat$/.test(s)) { d.extraBlock = (d.extraBlock ?? 0) + 1; statics.push({ k: 'extraBlock', who: 'self', n: 1 }); return true; }
  if (/^~ must be blocked if able$/.test(s)) { d.mustBlock = true; statics.push({ k: 'mustBlock', who: 'self' }); return true; }
  if (/^you may have ~ assign its combat damage as though it weren't blocked$/.test(s)) { d.asThoughUnblocked = true; return true; }
  if ((m = /^when you control no (.+?), sacrifice ~$/.exec(s))) { const fp = parseFilter(m[1]); if (!fp) return false; d.sacIfNo = fp.f; return true; }
  if ((m = /^if ~ was kicked, it enters with (a|an|one|two|three|four|five|six|x|\d+) \+1\/\+1 counters? on it$/.exec(s))) { d.etbCounters = { kind: '+1/+1', n: num(m[1])! }; d.etbCountersIf = { k: 'kicked' }; return true; }
  if (/^enchanted (creature|permanent) can't attack or block, and its activated abilities can't be activated$/.test(s)) {
    statics.push({ k: 'cantAttack', who: 'attached' }, { k: 'cantBlock', who: 'attached' }, { k: 'cantActivate', who: 'attached' }); return true;
  }

  if ((m = /^as an additional cost to cast (?:this spell|~), (sacrifice|discard|pay) (an|a|one|two|x|\d+) (.*?)$/.exec(s))) {
    if (m[1] === 'pay' && m[2] === 'x' && m[3] === 'life') { d.extraCost = { lifeX: true }; return true; }
    if (m[1] === 'discard' && m[2] === 'x' && /^cards?$/.test(m[3])) { d.extraCost = { discardX: true }; return true; }
    const n0 = num(m[2]); if (typeof n0 !== "number") return false; const n = n0;
    if (m[1] === 'pay' && /^life$/.test(m[3])) { d.extraCost = { life: +m[2] }; return true; }
    if (m[1] === 'discard' && /^cards?$/.test(m[3])) { d.extraCost = { discard: n }; return true; }
    if (m[1] === 'sacrifice' && / or discard a card$/.test(m[3])) { const fp = parseFilter(m[3].replace(/ or discard a card$/, '')); if (!fp || fp.card) return false; d.extraCost = { sacOrDiscard: { f: fp.f } }; return true; }
    if (m[1] === 'sacrifice') { const fp = parseFilter(m[3]); if (!fp || fp.card) return false; d.extraCost = { sacF: { f: fp.f, n } }; return true; }
    return false;
  }
  s = s.replace(/^(.*?)spells you cast of the chosen type cost/, '$1of the chosen type spells you cast cost');
  if ((m = /^(?:this spell|~) costs \{(\d)\} less to cast for each (.+)$/.exec(s))) { const a = forEach(m[2], newCx()); if (a === null) return false; d.selfCostLess = { n: +m[1], per: a }; return true; }
  if ((m = /^(~|enchanted creature|enchanted permanent|enchanted land|enchanted artifact|equipped creature) doesn't untap during (?:its controller's|your) untap step$/.exec(s))) { statics.push({ k: 'doesntUntap', who: m[1] === '~' ? 'self' : 'attached', cond: c }); return true; }
  if ((m = /^~ can't be blocked by (.+)$/.exec(s))) { const fp = parseFilter(m[1].replace(/^creatures/, 'creature')); if (!fp) return false; statics.push({ k: 'cantBeBlockedBy', who: 'self', spellF: fp.f, cond: c }); return true; }
  if (/^~ enters with a charge counter on it for each time it was kicked$/.test(s)) { d.etbCounters = { kind: 'charge', n: 'kicked' }; return true; }
  if ((m = /^~ enters with (a|an|one|two|three|four|five|six|x|\d+) ([+-]\d\/[+-]\d|[a-z]+) counters? on it(?: if (.+))?$/.exec(s))) { const cc = m[3] ? cond(m[3], newCx()) : undefined; if (m[3] && !cc) return false; d.etbCounters = { kind: m[2], n: num(m[1])! }; if (cc) d.etbCountersIf = cc; return true; }
  if ((m = /^~ enters with a number of \+1\/\+1 counters on it equal to (.+)$/.exec(s))) { const a = amount(m[1], newCx()); if (a === null) return false; d.etbCounters = { kind: '+1/+1', n: a }; return true; }
  if (/^(?:converge — )?~ enters with a \+1\/\+1 counter on it for each color of mana spent to (?:cast it|pay its (?:mana )?cost)$/.test(s)) { d.sunburst = true; return true; }
  if ((m = /^(?:this spell|~) costs \{(\d+)\} less to cast for each (.+)$/.exec(s))) { const a = forEach(m[2], newCx()); if (!a) return false; d.selfCostLess = { n: +m[1], per: a }; return true; }
  if ((m = /^(?:this spell|~) costs \{(\d+)\} less to cast if (.+)$/.exec(s))) {
    const cc = cond(m[2], newCx());
    if (/targets? a tapped creature/.test(m[2])) { d.costLessTgtTapped = +m[1]; return true; }
    if (!cc) return false; d.costLessIf = { n: +m[1], cond: cc }; return true;
  }
  if ((m = /^(?:this spell|~) costs \{x\} less to cast, where x is (.+)$/.exec(s))) { const a = amount(m[1], newCx()); if (a === null) return false; d.selfCostLess = { n: 1, per: a }; return true; }
  if (/^if you would gain life, you gain that much life plus 1 instead$/.test(s) && !c) { statics.push({ k: 'lifePlus1', who: 'self' }); return true; }
  if ((m = /^(aura|enchantment|artifact|creature|instant|sorcery) spells you cast cost \{(\d+)\} less to cast$/.exec(s)) && !c) {
    const typ = m[1][0].toUpperCase() + m[1].slice(1);
    statics.push({ k: 'costLess', who: 'all', n: +m[2], f: { types: [typ], fromHand: true } });
    return true;
  }
  if (/^creatures can't attack you unless their controller pays \{2\} for each creature they control that's attacking you$/.test(s) && !c) { statics.push({ k: 'propaganda', who: 'self' }); return true; }
  if ((m = /^spells you cast that target a creature cost \{(\d+)\} less to cast$/.exec(s)) && !c) { statics.push({ k: 'costLess', who: 'all', n: +m[1], tgtCreature: true }); return true; }
  if (/^untap all creatures you control during each other player's untap step$/.test(s) && !c) { statics.push({ k: 'oppUntapCreatures', who: 'self' }); return true; }
  if (/^as an additional cost to cast (?:this spell|~), sacrifice x creatures$/.test(s) && !c) { d.extraCost = { sacX: true }; return true; }
  if ((m = /^as an additional cost to cast (?:this spell|~), you may blight (\d+)$/.exec(s))) { d.optBlight = +m[1]; return true; }
  if (/^(this spell|~) can't be countered$/.test(s)) { d.uncounterable = true; return true; }
  if ((m = /^~ can't be blocked if you control (?:a|an) (.+)$/.exec(s))) { const fp = parseFilter(m[1]); if (!fp) return false; statics.push({ k: 'unblockable', who: 'self', cond: { k: 'control', f: fp.f, n: 1 } }); return true; }
  const PST: [RegExp, Static['k'], Static['who']][] = [
    [/^each opponent can't draw more than one card each turn$/, 'drawLimit', 'self'],
    [/^no more than one creature can attack ~ each combat$/, 'atkLimit1', 'self'],
    [/^each opponent can cast spells only any time they could cast a sorcery$/, 'oppsSorcery', 'self'],
    [/^spells and abilities your opponents control can't cause their controller to search their library$/, 'noSearch', 'self'],
    [/^if you would draw a card while your library has no cards in it, you win the game instead$/, 'winOnEmptyDraw', 'self'],
    [/^if (?:one or more tokens would be created under your control, twice that many of those tokens are created|an effect would create one or more tokens under your control, it creates twice that many of those tokens) instead$/, 'tokenDouble', 'self'],
    [/^you may activate (?:her|his|its|~'s) loyalty abilities any time you could cast an instant$|^you may activate loyalty abilities of ~ on any player's turn any time you could cast an instant$/, 'pwInstant', 'self'],
    [/^you may activate loyalty abilities of planeswalkers you control on any player's turn any time you could cast an instant$/, 'pwInstant', 'all'],
  ];
  for (const [re, k, who] of PST) if (re.test(s)) { statics.push({ k, who, cond: c }); return true; }
  if (/^creatures your opponents control enter tapped$/.test(s) && !c) { statics.push({ k: 'etbTappedOpp', who: 'self' }); return true; }
  if ((m = /^the second spell you cast each turn costs \{(\d+)\} less to cast$/.exec(s)) && !c) { statics.push({ k: 'secondSpellLess', who: 'self', n: +m[1] }); return true; }
  if ((m = /^(equipment and vehicle|vehicle and equipment) spells you cast cost \{(\d+)\} less to cast$/.exec(s)) && !c) { statics.push({ k: 'costLess', who: 'all', n: +m[2], spellF: { anyType: ['Equipment', 'Vehicle'] } }); return true; }
  if ((m = /^nonartifact spells you cast have improvise$/.exec(s)) && !c) { statics.push({ k: 'improviseSpells', who: 'self' }); return true; }
  if ((m = /^as long as equipped creature is legendary, it has (.+)$/.exec(s)) && !c) { const k = kwList(m[1]); if (!k) return false; statics.push({ k: 'kw', who: 'attached', kws: k, f: { legendary: true } }); return true; }
  if (/^creatures you control with a \+1\/\+1 counter on them have trample$/.test(s) && !c) { statics.push({ k: 'kw', who: 'all', f: { types: ['Creature'], ctrl: 'you', ctr: '+1/+1' }, kws: ['trample'] }); return true; }
if ((m = /^(?:you may pay|pay) (\d+) life rather than pay (?:this spell's|~'s) mana cost$/.exec(s)) && !c) { d.costOrLife = { life: +m[1], pay: 0 }; return true; }
  if ((m = /^during your turn, ~ has (.+)$/.exec(s)) && !c) { const k = kwList(m[1]); if (!k) return false; statics.push({ k: 'kw', who: 'self', kws: k, cond: { k: 'yourTurn' } }); return true; }
  if (/^you have (hexproof|shroud)$/.test(s) && !c) { statics.push({ k: 'playerHexproof', who: 'self', kws: [s.slice(9)] }); return true; }
  if (/^commanders you control have hexproof$/.test(s) && !c) { statics.push({ k: 'kw', who: 'all', f: { ctrl: 'you', cmdr: 'own' }, kws: ['hexproof'] }); return true; }
  if (/^you have no maximum hand size$/.test(s)) { statics.push({ k: 'noMaxHand', who: 'self' }); return true; }
  if (/^you can't lose the game and your opponents can't win the game$/.test(s)) { statics.push({ k: 'noGameEnd', who: 'self' }); return true; }
  if (/^your opponents can't gain life$/.test(s)) { statics.push({ k: 'noLifeGain', who: 'self' }); return true; }
  if (/^creatures you control can't have -1\/-1 counters put on them$/.test(s)) { statics.push({ k: 'noMinus', who: 'self' }); return true; }
  if (/^if you would lose unspent mana, that mana becomes colorless instead$/.test(s)) { statics.push({ k: 'manaPersist', who: 'self' }); return true; }
  if (/^~ gets \+1\/\+1 for each unspent mana you have$/.test(s)) { statics.push({ k: 'pt', who: 'self', p: { pool: true }, t: { pool: true } }); return true; }
  if (/^creatures you control with toxic have lifelink$/.test(s)) { statics.push({ k: 'toxicLink', who: 'self', cond: c }); return true; }
  if (/^you may play an additional land on each of your turns$/.test(s)) { statics.push({ k: 'noMaxHand', who: 'self', n: -1 }); return true; }
  if (/^you may play two additional lands on each of your turns$/.test(s)) { statics.push({ k: 'noMaxHand', who: 'self', n: -2 }); return true; }
  if (/^lands you control are every basic land type in addition to their other types$/.test(s)) { statics.push({ k: 'addLandType', who: 'all', f: { types: ['Land'], ctrl: 'you' }, add: ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'] }); return true; }
  if (/^untap all permanents you control during each other player's untap step$/.test(s)) { statics.push({ k: 'oppUntapAll', who: 'self' }); return true; }
  if (/^untap (?:~|this artifact) during each other player's untap step$/.test(s)) { statics.push({ k: 'oppUntapSelf', who: 'self' }); return true; }
  if (/^if an artifact or creature entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time$/.test(s) && !c) { d.etbACTrigTwice = true; return true; }
  if (/^if you would create a clue, food, or treasure token, instead create one of each$/.test(s) && !c) { d.manufactor = true; return true; }
  if (/^each nonland card in your graveyard has escape\. the escape cost is equal to the card's mana cost plus exile three other cards from your graveyard$/.test(s) && !c) { d.gyEscape = true; return true; }
  if (/^you may play lands and cast spells from the top of your library\. if you cast a spell this way, pay life equal to its mana value rather than pay its mana cost$/.test(s) && !c) { statics.push({ k: 'topCast', who: 'self' }, { k: 'topPlayLand', who: 'self' }); d.citadelLife = true; return true; }
  if (/^you may cast artifact spells and colorless spells from the top of your library$/.test(s) && !c) { statics.push({ k: 'topCast', who: 'self', spellF: { artOrColorless: true } }); return true; }
  if (/^your opponents can't cast spells during your turn$/.test(s) && !c) { statics.push({ k: 'oppsCantCast', who: 'self' }); return true; }
  if (/^creature spells of the chosen type cost \{(\d+)\} less to cast$/.test(s) && !c) { const mm = /^creature spells of the chosen type cost \{(\d+)\} less to cast$/.exec(s)!; statics.push({ k: 'costLess', who: 'all', n: +mm[1], spellF: { types: ['Creature'], chosenType: true } }); return true; }
  if (/^creatures you control have "\{t\}: add one mana of any color\."$/.test(s) && !c) { statics.push({ k: 'grantMana', who: 'all', f: { types: ['Creature'], ctrl: 'you' }, mana: [{ add: ['ANY'], tap: true }] }); return true; }
  if (/^creatures you control are every creature type\. the same is true for creature spells you control and creature cards you own that aren't on the battlefield$/.test(s) && !c) { statics.push({ k: 'allCreatureTypes', who: 'self' }); return true; }
  if (/^equipped creature gets \+(\d+)\/\+(\d+) and has protection from each color that's not in your commander's color identity$/.test(s) && !c) { const mm = /^equipped creature gets \+(\d+)\/\+(\d+) and has protection from each color that's not in your commander's color identity$/.exec(s)!; statics.push({ k: 'pt', who: 'attached', p: +mm[1], t: +mm[2] }, { k: 'protNotIdent', who: 'attached' }); return true; }
  if ((m = /^whenever enchanted forest is tapped for mana, its controller adds an additional one mana of the chosen color$/.exec(s))) { statics.push({ k: 'manaExtra', who: 'attached', add: ['CHOSEN'] }); return true; }
  if (/^you may play lands from your graveyard$/.test(s) && !c) { d.landsFromGy = true; return true; }
  if ((m = /^when (?:~|this artifact) has (\w+) or more charge counters on it, you win the game$/.exec(s))) { const n0 = num(m[1]); if (typeof n0 !== 'number') return false; d.winAtCharge = n0; return true; }
  if (/^you may play lands from the top of your library$/.test(s) && !c) { statics.push({ k: 'topPlayLand', who: 'self' }); return true; }
  if (/^if you would gain life, you gain twice that much life instead$/.test(s) && !c) { statics.push({ k: 'doubleLife', who: 'self' }); return true; }
  if (/^if you would draw a card except the first one you draw in each of your draw steps, draw two cards instead$/.test(s) && !c) { statics.push({ k: 'doubleDraw', who: 'self' }); return true; }
  if (/^if a land entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time$/.test(s) && !c) { d.landTrigTwice = true; return true; }
  if (/^if a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time$/.test(s) && !c) { d.permTrigTwice = true; return true; }
  if (/^during each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard$/.test(s) && !c) { d.muldrotha = true; return true; }
  if (/^players can't gain life$/.test(s) && !c) { statics.push({ k: 'noLifeGainAll', who: 'self' }); return true; }
  if (/^all damage is dealt as though its source had wither$/.test(s) && !c) { statics.push({ k: 'asThoughWither', who: 'self' }); return true; }
  if (/^spells you control can't be countered$/.test(s) && !c) { statics.push({ k: 'spellsUncounterable', who: 'self' }); return true; }
  if (/^you may cast creature spells of the chosen type from the top of your library$/.test(s) && !c) { statics.push({ k: 'topLook', who: 'self' }, { k: 'topCast', who: 'self', spellF: { types: ['Creature'], chosenType: true } }); return true; }
  if ((m = /^elemental permanent spells you cast from your hand gain evoke \{(\d+)\} as you cast them$/.exec(s)) && !c) { d.grantEvokeElem = { generic: +m[1] }; return true; }
  if (/^companion[—\- ]/.test(s) && !c) return true;
  if ((m = /^~ gets \+1\/\+1 for each color among permanents you control$/.exec(s)) && !c) { statics.push({ k: 'pt', who: 'self', p: { permColors: true }, t: { permColors: true } }); return true; }

  if (/^if one or more charge counters would be put on an artifact you control, that many plus one charge counters are put on it instead$/.test(s) && !c) { statics.push({ k: 'plusCharge', who: 'self' }); return true; }
  if (/^players can't activate planeswalkers' loyalty abilities$/.test(s) && !c) { statics.push({ k: 'noLoyalty', who: 'self' }); return true; }
  if (/^untap all artifacts you control during each other player's untap step$/.test(s) && !c) { statics.push({ k: 'oppUntapArts', who: 'self' }); return true; }

  if ((m = /^if one or more \+1\/\+1 counters would be put on (?:another |an? )?(.+?), that many plus one \+1\/\+1 counters are put on (?:it|that permanent) instead$/.exec(s)) && !c) {
    const who = m[1];
    const fp = parseFilter(who); if (!fp) return false;
    statics.push({ k: 'plusP1P1', who: 'all', f: { ...fp.f, other: / on another /.test(s) || undefined, ctrl: 'you' } }); return true;
  }
  if ((m = /^spells you cast from anywhere other than your hand cost \{(\d+)\} less to cast$/.exec(s)) && !c) { statics.push({ k: 'costLess', who: 'all', n: +m[1], fromNotHand: true }); return true; }
  if (/^enchantment spells you cast have affinity for auras$/.test(s) && !c) { const a = forEach('aura you control', newCx()); if (!a) return false; statics.push({ k: 'costLess', who: 'all', spellF: { types: ['Enchantment'] }, p: a }); return true; }
  if ((m = /^the first spell you cast with \{x\} in its mana cost each turn costs \{(\d+)\} less to cast for each \+1\/\+1 counter on ~$/.exec(s)) && !c) { statics.push({ k: 'costLess', who: 'all', firstX: true, p: { ctr: '+1/+1', who: 'self' } }); return true; }
  if (/^~ enters with twice x \+1\/\+1 counters on it$/.test(s) && !c) { d.etbCounters = { kind: '+1/+1', n: { mul: 2, of: 'X' } }; return true; }
  if ((m = /^(nontoken creatures you control) enter with an additional \+1\/\+1 counter on them for each creature that died under your control this turn$/.exec(s)) && !c) { statics.push({ k: 'etbExtra', who: 'all', f: { types: ['Creature'], ctrl: 'you', nontoken: true }, kws: ['+1/+1'], p: { diedYou: true } }); return true; }
  if ((m = /^(.*?)spells (you cast|your opponents cast|cost) ?(?:cost )?\{(\d)\} (less|more) to cast$/.exec(s))) {
    const fp = m[1].trim() ? parseFilter(m[1].trim() + ' spell') : { f: {} }; if (!fp) return false;
    if (m[2] === 'your opponents cast' && m[4] === 'less') return false; if (m[2] === 'you cast' && m[4] === 'more') return false;
    statics.push({ k: m[4] === 'less' ? 'costLess' : 'costMore', who: 'all', n: +m[3], spellF: fp.f, cond: c }); return true;
  }
  if ((m = /^(enchanted (?:creature|permanent)|~) loses all abilities and is an? (?:(white|blue|black|red|green) )?(\w+) creature with base power and toughness (\d+)\/(\d+)$/.exec(s))) {
    const sub = m[3][0].toUpperCase() + m[3].slice(1);
    const st: Static = { k: 'basePT', who: m[1] === '~' ? 'self' : 'attached', p: +m[4], t: +m[5], kws: [sub], loseAll: true };
    if (m[2]) st.colors = [COLOR_OF[m[2]]];
    statics.push(st); return true;
  }
  if ((m = /^(enchanted creature|~) loses all abilities and has base power and toughness (\d+)\/(\d+)$/.exec(s))) {
    statics.push({ k: 'basePT', who: m[1] === '~' ? 'self' : 'attached', p: +m[2], t: +m[3], loseAll: true }); return true;
  }
  if ((m = /^(enchanted creature|equipped creature|~) has base power and toughness (\d+)\/(\d+)$/.exec(s))) {
    statics.push({ k: 'basePT', who: m[1] === '~' ? 'self' : 'attached', p: +m[2], t: +m[3] }); return true;
  }
  if ((m = /^enchanted artifact is a creature with base power and toughness (\d+)\/(\d+) in addition to its other types$/.exec(s))) {
    statics.push({ k: 'basePT', who: 'attached', p: +m[1], t: +m[2], add: ['Creature'] }); return true;
  }
  if ((m = /^~'s power and toughness are each equal to (.+)$/.exec(s))) { const a = amount(m[1], newCx()); if (a === null) return false; statics.push({ k: 'pt', who: 'self', p: a, t: a }); return true; }
  if ((m = /^~'s power is equal to (.+?) and (?:its |~'s )?toughness is (?:equal to )?that number plus (\d+)$/.exec(s))) { const a = amount(m[1], newCx()); if (a === null) return false; statics.push({ k: 'pt', who: 'self', p: a, t: { plus: +m[2], of: a } }); return true; }
  if ((m = /^~'s power is equal to (.+)$/.exec(s))) { const a = amount(m[1], newCx()); if (a === null) return false; statics.push({ k: 'pt', who: 'self', p: a, t: 0 }); return true; }
  if ((m = /^~'s toughness is equal to (.+)$/.exec(s))) { const a = amount(m[1], newCx()); if (a === null) return false; statics.push({ k: 'pt', who: 'self', p: 0, t: a }); return true; }
  if ((m = /^enchanted creature gets \+(\d+)\/\+(\d+), has (.+), and is an? ([a-z]+) in addition to its other types$/.exec(s))) {
    const k = kwList(m[3]); if (!k) return false;
    const sub = m[4][0].toUpperCase() + m[4].slice(1);
    statics.push({ k: 'pt', who: 'attached', p: +m[1], t: +m[2], cond: c }, { k: 'kw', who: 'attached', kws: k, cond: c }, { k: 'addSub', who: 'attached', kws: [sub], cond: c });
    return true;
  }
  if ((m = /^(enchanted creature|equipped creature|~) gets \+(\d+)\/\+(\d+) and loses (.+)$/.exec(s))) {
    const who0: Static['who'] = m[1] === '~' ? 'self' : 'attached';
    const lost = kwList(m[4]); if (!lost) return false;
    statics.push({ k: 'pt', who: who0, p: +m[2], t: +m[3], cond: c }, { k: 'loseKw', who: who0, kws: lost, cond: c });
    return true;
  }
  // Job typeline grants (Job select leftovers)
  if ((m = /^equipped creature is an? ([a-z]+) in addition to its other types and has "(.+)"$/.exec(s))) {
    const sub = m[1][0].toUpperCase() + m[1].slice(1);
    const ext = tokenAbil(m[2], CUR_NAME); if (!ext) return false;
    statics.push({ k: 'addSub', who: 'attached', kws: [sub], cond: c }, { k: 'grantAbil', who: 'attached', grant: ext, cond: c });
    return true;
  }
  if ((m = /^equipped creature gets \+(\d+)\/\+(\d+), is an? ([a-z]+) in addition to its other types, and has "(.+)"$/.exec(s))) {
    const sub = m[3][0].toUpperCase() + m[3].slice(1);
    const ext = tokenAbil(m[4], CUR_NAME); if (!ext) return false;
    statics.push({ k: 'pt', who: 'attached', p: +m[1], t: +m[2], cond: c }, { k: 'addSub', who: 'attached', kws: [sub], cond: c }, { k: 'grantAbil', who: 'attached', grant: ext, cond: c });
    return true;
  }
  if ((m = /^equipped creature gets \+(\d+)\/\+(\d+), has (.+?) and "(.+)", and is an? ([a-z]+) in addition to its other types$/.exec(s))) {
    const kws0 = kwList(m[3]); if (!kws0) return false;
    const sub = m[5][0].toUpperCase() + m[5].slice(1);
    const ext = tokenAbil(m[4], CUR_NAME); if (!ext) return false;
    statics.push({ k: 'pt', who: 'attached', p: +m[1], t: +m[2], cond: c }, { k: 'kw', who: 'attached', kws: kws0, cond: c }, { k: 'addSub', who: 'attached', kws: [sub], cond: c }, { k: 'grantAbil', who: 'attached', grant: ext, cond: c });
    return true;
  }
  if ((m = /^equipped creature gets \+(\d+)\/\+(\d+) for each (.+) on ~ and is an? ([a-z]+) in addition to its other types$/.exec(s))) {
    const fe = forEach(m[3], newCx()); if (!fe) return false;
    const sub = m[4][0].toUpperCase() + m[4].slice(1);
    statics.push({ k: 'pt', who: 'attached', p: { mul: +m[1], of: fe }, t: { mul: +m[2], of: fe }, cond: c }, { k: 'addSub', who: 'attached', kws: [sub], cond: c });
    return true;
  }
  // subject + predicate
  const sm = /^(.+?) (gets?|get|has|have|can't block|can't attack or block|can't attack|can't be blocked|attacks each combat if able|attack each combat if able)(?: (.+))?$/.exec(s);
  if (!sm) return false;
  const subjS = sm[1]; let who: Static['who']; let f: Filter | undefined;
  if (subjS === '~') who = 'self'; else if (/^(enchanted|equipped) (creature|permanent|land|artifact)$/.test(subjS)) who = 'attached';
  else { const o = /^(other )?(.+)$/.exec(subjS)!; const fp = parseFilter(o[2]); const pluralVerb = sm[2] === 'get' || sm[2] === 'have'; if (!fp || fp.card || fp.spell || (!fp.plural && !pluralVerb && !/you control|your opponents control/.test(o[2]))) return false; who = o[1] ? 'others' : 'all'; f = fp.f; if (o[1]) f.other = true; }
  const pred = sm[2]; const rest = sm[3] ?? '';
  const out: Static[] = [];
  if (/^gets?$|^get$/.test(pred)) {
    const xm = /^([+-])x\/([+-](?:\d+|x)), where x is (.+)$/.exec(rest);
    if (xm) { const a = amount(xm[3], newCx()); if (a === null) return false; const p: Amt = xm[1] === '-' ? { mul: -1, of: a } : a; out.push({ k: 'pt', who, f, p, t: 0, cond: c }); statics.push(...out); return true; }
    const pm = /^([+-]\d+)\/([+-]\d+)(?: for each (.+?))?(?:,? (?:and )?(?:has|have) (.+?))?(?:,? and is goaded)?$/.exec(rest); if (!pm) return false;
    let p: Amt = +pm[1], t: Amt = +pm[2];
    if (pm[3]) { const fe = forEach(pm[3], newCx()); if (!fe) return false; p = p ? { mul: p as number, of: fe } : 0; t = t ? { mul: t as number, of: fe } : 0; }
    out.push({ k: 'pt', who, f, p, t, cond: c });
    if (pm[4]) {
      const kws2 = pm[4].replace(/, and is goaded$/, '').replace(/ and is goaded$/, '');
      const qm = /^"(.+)"$/.exec(kws2.trim());
      if (qm) {
        const ext = tokenAbil(qm[1], CUR_NAME);
        if (!ext) return false;
        out.push({ k: 'grantAbil', who, f, grant: ext, cond: c });
      } else {
        const wm = /^(.*?)(?: and )?ward \{(\d+)\}$/.exec(kws2);
        const kpart = wm ? wm[1].replace(/ and $/, '').trim() : kws2;
        const k = kpart ? kwList(kpart) : [];
        if (kpart && !k) return false;
        if (k?.length) out.push({ k: 'kw', who, f, kws: k, cond: c });
        if (wm) out.push({ k: 'wardN', who, f, n: +wm[2], cond: c });
      }
    }
    if (/and is goaded$/.test(rest)) out.push({ k: 'goad', who, f, cond: c });
  } else if (/^has$|^have$/.test(pred) && /^"\{t\}: add .+"$/.test(rest)) { const mm = /^"\{t\}: add (.+?)\.?"$/.exec(rest)!; const ma = manaAdd(mm[1], newCx()); if (!ma || ma.n) return false; out.push({ k: 'grantMana', who, f, mana: [{ add: ma.mana }], cond: c }); }
  else if (/^has$|^have$/.test(pred) && /^"(.+)"$/.test(rest)) { const body = /^"(.+)"$/.exec(rest)![1]; const ext = tokenAbil(body, CUR_NAME); if (!ext) return false; out.push({ k: 'grantAbil', who, f, grant: ext, cond: c }); }
  else if (/^has$|^have$/.test(pred)) { const goaded = / and is goaded$/.test(rest); const rest0 = rest.replace(/ and is goaded$/, ''); const wm = /^(.*?)(?: and )?ward \{(\d+)\}$/.exec(rest0); if (wm && (!wm[1] || kwList(wm[1].replace(/ and $/, '').trim()))) { if (wm[1].replace(/ and $/, '').trim()) { const k0 = kwList(wm[1].replace(/ and $/, '').trim())!; if (who === 'self' && !c && !goaded) k0.forEach(x => kws.add(x)); else out.push({ k: 'kw', who, f, kws: k0, cond: c }); } out.push({ k: 'wardN', who, f, n: +wm[2], cond: c }); if (goaded) out.push({ k: 'goad', who, f, cond: c }); } else { const k = kwList(rest0); if (!k) return false; if (who === 'self' && !c && !goaded) { k.forEach(x => kws.add(x)); return true; } out.push({ k: 'kw', who, f, kws: k, cond: c }); if (goaded) out.push({ k: 'goad', who, f, cond: c }); } }
  else if (pred === "can't block") { if (rest) return false; out.push({ k: 'cantBlock', who, f, cond: c }); }
  else if (pred === "can't attack or block") { if (rest) return false; out.push({ k: 'cantBlock', who, f, cond: c }, { k: 'cantAttack', who, f, cond: c }); }
  else if (pred === "can't attack") { if (rest) return false; out.push({ k: 'cantAttack', who, f, cond: c }); }
  else if (pred === "can't be blocked") { let k: string[] | null = null; if (rest) { const hm = /^and (?:has|have) (.+)$/.exec(rest); k = hm ? kwList(hm[1]) : null; if (!k) return false; } out.push({ k: 'unblockable', who, f, cond: c }); if (k) out.push({ k: 'kw', who, f, kws: k, cond: c }); }
  else if (/attacks? each combat if able/.test(pred)) { if (rest) return false; out.push({ k: 'mustAttack', who, f, cond: c }); }
  else return false;
  statics.push(...out); return true;
}
