/** Exact Oracle patches for Final Fantasy Commander leftovers the generic compiler doesn't fully parse. */
import type { CardDef, Effect, TriggerDef, TSlot, TokenSpec, Filter, ActAbility, Static, Modes, Cond, Cost } from './types';

type Patch = (d: CardDef) => void;
export const S = (kind: string, extra: Partial<Effect> = {}): Effect => ({ op: 'script', kind, ...extra });
export const T = (ev: string, effects: Effect[], extra: Partial<TriggerDef> = {}): TriggerDef => ({ on: 'x', ev, label: extra.label ?? 'trigger', effects, ...extra });
export const trig = (d: CardDef, ...ts: TriggerDef[]) => { (d.triggers ??= []).push(...ts); };
export const spell = (d: CardDef, effects: Effect[], tslots?: TSlot[]) => { const sp = (d.spell ??= { effects: [] }); sp.effects.push(...effects); if (tslots) sp.tslots = [...(sp.tslots ?? []), ...tslots]; };
export const abil = (d: CardDef, a: ActAbility) => { (d.abilities ??= []).push(a); };
export const st = (d: CardDef, ...ss: Static[]) => { (d.statics ??= []).push(...ss); };
export const mana = (d: CardDef, m: NonNullable<CardDef['mana']>[number]) => { (d.mana ??= []).push(m); };
const C: Filter = { types: ['Creature'], ctrl: 'you' };
export const HERO: TokenSpec = { name: 'Hero', p: 1, t: 1, colors: [], types: ['Creature'], sub: ['Hero'] };
export const MOOGLE: TokenSpec = { name: 'Moogle', p: 1, t: 2, colors: ['W'], types: ['Creature'], sub: ['Moogle'], kws: ['lifelink'] };
export const REBEL: TokenSpec = { name: 'Rebel', p: 2, t: 2, colors: ['R'], types: ['Creature'], sub: ['Rebel'] };
export const SOLDIER: TokenSpec = { name: 'Soldier', p: 1, t: 1, colors: ['W'], types: ['Creature'], sub: ['Soldier'] };
export const TREASURE: TokenSpec = { name: 'Treasure', colors: [], types: ['Artifact'], preset: 'Treasure' };
export const ZOMBIE: TokenSpec = { name: 'Zombie', p: 2, t: 2, colors: ['B'], types: ['Creature'], sub: ['Zombie'] };
const EQ: Filter = { anyType: ['Equipment'], ctrl: 'you' };
const parseModes = (list: Modes['list'], min = 1, max = 1): Modes => ({ min, max, list });

export const FIC_SCRIPTS: Record<string, Record<string, Patch>> = {
  // ----- Face commanders -----
  'Terra, Herald of Hope': {
    'whenever ~ deals combat damage to a player, you may pay {2}. when you do, return target creature card with power 3 or less from your graveyard to the battlefield tapped': d =>
      trig(d, T('combatDamagePlayer', [S('terraReanim')], { subj: 'self', label: 'you may pay {2} to return a creature', tslots: [{ who: 'card', zoneOwner: 'you', opt: true, f: { types: ['Creature'], powLE: 3 } }] })),
  },
  'Celes, Rune Knight': {
    'when ~ enters, discard any number of cards, then draw that many cards plus one': d =>
      trig(d, T('etb', [S('celesLoot')], { subj: 'self', label: 'discard any number, draw that many plus one' })),
    'whenever one or more other creatures you control enter, if one or more of them entered from a graveyard or was cast from a graveyard, put a +1/+1 counter on each creature you control': d =>
      trig(d, T('etb', [S('celesCounters')], { subj: 'other', f: C, batch: true, label: '+1/+1 counters if they entered from a graveyard' })),
  },
  'Cloud, Ex-SOLDIER': {
    'when ~ enters, attach up to one target equipment you control to it': d =>
      trig(d, T('etb', [{ op: 'attach', who: 't0', other: 'self' }], { subj: 'self', label: 'attach an Equipment', tslots: [{ who: 'perm', opt: true, f: EQ }] })),
    'whenever ~ attacks, draw a card for each equipped attacking creature you control. then if ~ has power 7 or greater, create two treasure tokens': d =>
      trig(d, T('attacks', [S('cloudAtk')], { subj: 'self', label: 'draw, then Treasures if power 7+' })),
  },
  'Tifa, Martial Artist': {
    "whenever one or more creatures you control with power 7 or greater deal combat damage to a player, untap all creatures you control. if it's the first combat phase of your turn, there is an additional combat phase after this phase": d =>
      trig(d, T('combatDamagePlayer', [{ op: 'untap', who: { all: C } }, S('tifaCombat')], { subj: 'any', f: { types: ['Creature'], ctrl: 'you', powGE: 7 }, batch: true, label: 'untap, maybe an additional combat' })),
  },
  "Tidus, Yuna's Guardian": {
    'at the beginning of combat on your turn, you may move a counter from target creature you control onto a second target creature you control': d =>
      trig(d, T('beginCombat', [S('tidusMove')], { pl: 'you', label: 'you may move a counter', tslots: [{ who: 'perm', opt: true, f: C }, { who: 'perm', opt: true, f: C, distinct: true }] })),
    'cheer — whenever one or more creatures you control with counters on them deal combat damage to a player, you may draw a card and proliferate. do this only once each turn': d =>
      trig(d, T('combatDamagePlayer', [S('tidusCheer')], { subj: 'any', f: { types: ['Creature'], ctrl: 'you', anyCtr: true }, batch: true, once: true, label: 'Cheer — you may draw and proliferate' })),
  },
  'Yuna, Grand Summoner': {
    'grand summon — {t}: add one mana of any color. when you next cast a creature spell this turn, that creature enters with two additional +1/+1 counters on it': d => {
      abil(d, { label: 'Grand Summon', tap: true, manaAb: true, effects: [{ op: 'addMana', mana: ['ANY'] }, S('yunaSummon')] });
    },
    'whenever another permanent you control is put into a graveyard from the battlefield, if it had one or more counters on it, you may put that number of +1/+1 counters on target creature': d =>
      trig(d, T('ltb', [S('yunaLegacy')], { subj: 'other', f: { ctrl: 'you' }, label: 'you may move its counters as +1/+1s', tslots: [{ who: 'perm', opt: true, f: C }] })),
  },
  "G'raha Tia, Scion Reborn": {
    "throw wide the gates — whenever you cast a noncreature spell, you may pay x life, where x is that spell's mana value. if you do, create a 1/1 colorless hero creature token and put x +1/+1 counters on it. do this only once each turn": d =>
      trig(d, T('cast', [S('grahaGates')], { pl: 'you', filter: 'noncreature', once: true, label: "Throw Wide the Gates" } as Partial<TriggerDef>)),
  },

  // ----- Job select leftovers -----
  "Dancer's Chakrams": {
    'equipped creature gets +2/+2, has lifelink and "other commanders you control get +2/+2 and have lifelink," and is a performer in addition to its other types': d => st(d,
      { k: 'pt', who: 'attached', p: 2, t: 2 },
      { k: 'kw', who: 'attached', kws: ['lifelink'] },
      { k: 'addSub', who: 'attached', kws: ['Performer'] },
      { k: 'grantAbil', who: 'attached', grant: { statics: [
        { k: 'pt', who: 'all', f: { cmdr: 'own', other: true }, p: 2, t: 2 },
        { k: 'kw', who: 'all', f: { cmdr: 'own', other: true }, kws: ['lifelink'] },
      ] } },
    ),
  },
  "Blue Mage's Cane": {
    'equipped creature gets +0/+2, is a wizard in addition to its other types, and has "whenever ~ attacks, exile up to one target instant or sorcery card from defending player\'s graveyard. if you do, copy it. you may cast the copy by paying {3} rather than paying its mana cost."': d => st(d,
      { k: 'pt', who: 'attached', p: 0, t: 2 },
      { k: 'addSub', who: 'attached', kws: ['Wizard'] },
      { k: 'grantAbil', who: 'attached', grant: { triggers: [T('attacks', [S('blueMageCast')], { subj: 'self', label: 'exile and maybe cast a copy', tslots: [{ who: 'card', zoneOwner: 'opp', opt: true, f: { anyType: ['Instant', 'Sorcery'] } }] })] } },
    ),
  },
  "Astrologian's Planisphere": {
    'equipped creature is a wizard in addition to its other types and has "whenever you cast a noncreature spell and whenever you draw your third card each turn, put a +1/+1 counter on ~."': d => st(d,
      { k: 'addSub', who: 'attached', kws: ['Wizard'] },
      { k: 'grantAbil', who: 'attached', grant: { triggers: [
        T('cast', [{ op: 'addC', kind: '+1/+1', n: 1, who: 'self' }], { pl: 'you', filter: 'noncreature', label: '+1/+1 counter' } as Partial<TriggerDef>),
        T('draw', [{ op: 'addC', kind: '+1/+1', n: 1, who: 'self' }], { pl: 'you', nth: { k: 'draw', n: 3 }, label: 'third card: +1/+1' }),
      ] } },
    ),
  },
  "Reaper's Scythe": {
    'at the beginning of your end step, put a soul counter on ~ for each player who lost life this turn': d =>
      trig(d, T('endStep', [S('reaperSoul')], { pl: 'you', label: 'soul counters' })),
    'equipped creature gets +1/+1 for each soul counter on ~ and is an assassin in addition to its other types': d => st(d,
      { k: 'pt', who: 'attached', p: { ctr: 'soul', who: 'self' }, t: { ctr: 'soul', who: 'self' } },
      { k: 'addSub', who: 'attached', kws: ['Assassin'] },
    ),
  },
  "Sage's Nouliths": {
    'equipped creature gets +1/+0, has "whenever ~ attacks, untap target attacking creature," and is a cleric in addition to its other types': d => st(d,
      { k: 'pt', who: 'attached', p: 1, t: 0 },
      { k: 'addSub', who: 'attached', kws: ['Cleric'] },
      { k: 'grantAbil', who: 'attached', grant: { triggers: [T('attacks', [{ op: 'untap', who: 't0' }], { subj: 'self', label: 'untap an attacker', tslots: [{ who: 'perm', f: { types: ['Creature'], attacking: true } }] })] } },
    ),
  },

  // ----- Tiered -----
  "Cloud's Limit Break": {
    'tiered\n• cross-slash — {0} — destroy target tapped creature.\n• blade beam — {1} — destroy any number of target tapped creatures with different controllers.\n• omnislash — {3}{w} — destroy all tapped creatures': d => {
      d.tierCosts = [{ generic: 0 }, { generic: 1 }, { W: 1, generic: 3 }];
      d.spell = { effects: [], modes: { min: 1, max: 1, list: [
        { label: 'Cross-Slash — {0}', tslots: [{ who: 'perm', f: { types: ['Creature'], tapped: true }, harm: true }], effects: [{ op: 'destroy', who: 't0' }] },
        { label: 'Blade Beam — {1}', effects: [S('bladeBeam')] },
        { label: 'Omnislash — {3}{W}', effects: [S('omnislash')] },
      ] } };
    },
  },

  // ----- Tifa already done; Yuffie ETB -----
  'Yuffie, Materia Hunter': {
    'when ~ enters, gain control of target noncreature artifact for as long as you control ~. then you may attach an equipment you control to ~': d =>
      trig(d, T('etb', [S('yuffieSteal')], { subj: 'self', label: 'gain control of an artifact, maybe attach', tslots: [{ who: 'perm', f: { types: ['Artifact'], notTypes: ['Creature'] }, harm: true }] })),
  },
};

