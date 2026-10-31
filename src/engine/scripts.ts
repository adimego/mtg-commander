// Card scripts: hand-written rules for exact Oracle lines the generic compiler can't express.
// Each entry is keyed by card name, then by the exact normalized line the compiler reported as unparsed
// ("~" = the card's name, lowercase, no trailing period). If Oracle text changes, the key stops matching and
// the card honestly falls back to limited support.
import type { CardDef, Effect, TriggerDef, TSlot, TokenSpec, Filter } from './types';

type Patch = (d: CardDef) => void;
const S = (kind: string, extra: Partial<Effect> = {}): Effect => ({ op: 'script', kind, ...extra });
const T = (ev: string, effects: Effect[], extra: Partial<TriggerDef> = {}): TriggerDef => ({ on: 'x', ev, label: extra.label ?? 'trigger', effects, ...extra });
const trig = (d: CardDef, ...ts: TriggerDef[]) => { (d.triggers ??= []).push(...ts); };
const spell = (d: CardDef, effects: Effect[], tslots?: TSlot[]) => { const sp = (d.spell ??= { effects: [] }); sp.effects.push(...effects); if (tslots) sp.tslots = [...(sp.tslots ?? []), ...tslots]; };
const YOUR_CREATURES: Filter = { types: ['Creature'], ctrl: 'you' };
const OPP_CREATURES: Filter = { types: ['Creature'], ctrl: 'opp' };
const SOLDIER: TokenSpec = { name: 'Soldier', p: 1, t: 1, colors: ['W'], types: ['Creature'], sub: ['Soldier'] };

/** 'for each opponent, … up to one target … that player controls': one optional slot per opponent (up to 3 in a 4-player pod; extra slots stay empty). */
const eachOpp = (f: Filter, harm = true): TSlot[] => [0, 1, 2].map(i => ({ who: 'perm' as const, f, opt: true, oppIdx: i, harm }));
const chapter = (d: CardDef, n: number[], effects: Effect[], tslots?: TSlot[]) => trig(d, ...n.map(k => T('chapter', effects, { subj: 'self', ifc: { k: 'evAmt', n: k }, label: `chapter ${'I'.repeat(k).replace('IIII', 'IV')}`, tslots })));
const ROBOT: TokenSpec = { name: 'Robot Villain', p: 2, t: 2, colors: [], types: ['Artifact', 'Creature'], sub: ['Robot', 'Villain'] };
export const SCRIPTS: Record<string, Record<string, Patch>> = {
  'Syphon Mind': { 'each other player discards a card. you draw a card for each card discarded this way': d => spell(d, [{ op: 'discard', n: 1, pl: 'opps' }, { op: 'draw', n: 'chosen' }]) },
  'Cut a Deal': { 'each opponent draws a card, then you draw a card for each opponent who drew a card this way': d => spell(d, [S('cutDeal')]) },
  'Overwhelming Stampede': { 'until end of turn, creatures you control gain trample and get +x/+x, where x is the greatest power among creatures you control': d => spell(d, [{ op: 'grant', who: { all: YOUR_CREATURES }, kw: ['trample'] }, { op: 'pump', who: { all: YOUR_CREATURES }, n: { maxPow: { types: ['Creature'] } }, m: { maxPow: { types: ['Creature'] } } }]) },
  'Flame On!': { 'put x +1/+1 counters on target creature, where x is the number of noncreature, nonland cards in your graveyard. it gains flying until end of turn': d => spell(d, [{ op: 'addC', who: 't0', kind: '+1/+1', n: { cards: 'graveyard', pl: 'you', f: { notTypes: ['Creature', 'Land'] } } }, { op: 'grant', who: 't0', kw: ['flying'] }], [{ who: 'perm', f: { types: ['Creature'] } }]) },
  'Royal Talon Fighter Jet': { 'whenever ~ enters or attacks, create a number of 1/1 white soldier creature tokens equal to the number of +1/+1 counters on it': d => { const fx: Effect[] = [{ op: 'token', n: { ctr: '+1/+1', who: 'self' }, tok: SOLDIER }]; trig(d, T('etb', fx, { subj: 'self', label: 'create Soldiers' }), T('attacks', fx, { subj: 'self', label: 'create Soldiers' })); } },
  'Ultimate Nullification': { "exile all creatures and graveyards. put ~ on the bottom of its owner's library": d => spell(d, [{ op: 'exile', who: { all: { types: ['Creature'] } } }, { op: 'exileGrave', pl: 'all' }, S('selfAway', { dest: 'bottom' })]) },
  'Scourglass': { '{t}, sacrifice ~: destroy all permanents except for artifacts and lands. activate only during your upkeep': d => { (d.abilities ??= []).push({ label: 'Destroy all permanents except artifacts and lands', tap: true, sac: true, cond: { k: 'yourUpkeep' }, effects: [{ op: 'destroy', who: { all: { notTypes: ['Artifact', 'Land'] } } }] }); } },
  'Taunt from the Rampart': { "goad all creatures your opponents control. until your next turn, those creatures can't block": d => spell(d, [{ op: 'goad', who: { all: OPP_CREATURES } }, { op: 'grant', who: { all: OPP_CREATURES }, kw: ['_cantblock'], until: 'yourNext' }]) },
  'Hulkbuster Armor': { 'equipped creature has base power and toughness 9/9 and has flying': d => { (d.statics ??= []).push({ k: 'basePT', who: 'attached', p: 9, t: 9 }, { k: 'kw', who: 'attached', kws: ['flying'] }); } },
  'The Wasp, Winsome Avenger': { 'whenever ~ attacks, tap target creature defending player controls': d => trig(d, T('attacks', [{ op: 'tap', who: 't0' }], { subj: 'self', label: 'tap target creature defending player controls', tslots: [{ who: 'perm', f: { types: ['Creature'], defP: true }, harm: true }] })) },
  'Everett K. Ross, Hapless Attaché': { 'whenever an opponent attacks you with two or more creatures, draw a card': d => trig(d, T('youAttack', [{ op: 'draw', n: 1 }], { pl: 'notyou', ifc: { k: 'atkMeGE', n: 2 }, label: 'draw a card' })) },
  'Heart-Shaped Herb': { "{2}, {t}, sacrifice ~: you may sacrifice a creature. if you do, return that card to the battlefield under its owner's control with three +1/+1 counters on it and you become the monarch": d => { (d.abilities ??= []).push({ label: 'Sacrifice a creature; it returns with three +1/+1 counters; become the monarch', mana: { generic: 2 }, tap: true, sac: true, effects: [S('herb')] }); } },
  'Age of Ultron': {
    'i — for each opponent, destroy up to one target nonartifact creature that player controls': d => chapter(d, [1], [{ op: 'destroy', who: 'tr:0-2' }], eachOpp({ types: ['Creature'], notTypes: ['Artifact'] })),
    'iii — artifact creatures you control gain deathtouch until end of turn. put a +1/+1 counter on each of them': d => chapter(d, [3], [{ op: 'grant', who: { all: { types: ['Artifact', 'Creature'], ctrl: 'you' } }, kw: ['deathtouch'] }, { op: 'addC', who: { all: { types: ['Artifact', 'Creature'], ctrl: 'you' } }, kind: '+1/+1', n: 1 }]),
  },
  'Dismantling Wave': {
    'for each opponent, destroy up to one target artifact or enchantment that player controls': d => spell(d, [{ op: 'destroy', who: 'tr:0-2' }], eachOpp({ anyType: ['Artifact', 'Enchantment'] })),
    'when you cycle ~, destroy all artifacts and enchantments': d => trig(d, T('cycled', [{ op: 'destroy', who: { all: { anyType: ['Artifact', 'Enchantment'] } } }], { subj: 'self', label: 'destroy all artifacts and enchantments' })),
  },
  'Tri-Sentinel, Act of Vengeance': { 'when ~ enters, for each opponent, ~ deals 3 damage to up to one target creature that player controls': d => trig(d, T('etb', [{ op: 'damage', who: 'tr:0-2', n: 3 }], { subj: 'self', label: '3 damage to up to one creature of each opponent', tslots: eachOpp({ types: ['Creature'] }) })) },
  "King Solomon's Frogs": { 'when ~ enters, if you cast it, for each opponent, exile up to one target permanent that player controls with mana value 3 or greater. for each permanent exiled this way, its controller draws a card': d => trig(d, T('etb', [S('frogs')], { subj: 'self', ifc: { k: 'wasCast' }, label: 'exile up to one permanent (MV 3+) of each opponent', tslots: eachOpp({ mvGE: 3 }) })) },
  'Kang Dynasty': {
    'i, ii — for each opponent, tap up to one target creature that player controls. goad those creatures. until your next turn, whenever any of those creatures deals combat damage to a player, draw a card': d => chapter(d, [1, 2], [{ op: 'tap', who: 'tr:0-2' }, { op: 'goad', who: 'tr:0-2' }, { op: 'watch', who: 'tr:0-2', kind: 'combatDamagePlayer', until: 'yourNext', text: 'draw a card', sub: [{ op: 'draw', n: 1 }] }], eachOpp({ types: ['Creature'] })),
    "iii — target creature you control gets +1/+1 until end of turn for each card in your hand and can't be blocked this turn": d => chapter(d, [3], [{ op: 'pump', who: 't0', n: { cards: 'hand', pl: 'you' }, m: { cards: 'hand', pl: 'you' } }, { op: 'grant', who: 't0', kw: ['_unblockable'] }], [{ who: 'perm', f: YOUR_CREATURES }]),
  },
};

/** Apply scripts for lines the compiler couldn't parse; covered lines are removed from `unparsed`. */
export function applyScripts(name: string, d: CardDef, unparsed: string[]) {
  const sc = SCRIPTS[name]; if (!sc) return;
  for (let i = unparsed.length - 1; i >= 0; i--) { const p = sc[unparsed[i].replace(/\.$/, "")]; if (!p) continue; p(d); unparsed.splice(i, 1); }
  if (!unparsed.length) d.compiled = true;
}
