/** Exact Oracle patches for Secrets of Strixhaven Commander cards the generic compiler couldn't fully parse. */
import type { CardDef, Effect, TriggerDef, TSlot, TokenSpec, Filter, Cond } from './types';
import { SOC_LEFTOVERS } from './soc-leftovers';

type Patch = (d: CardDef) => void;
const S = (kind: string, extra: Partial<Effect> = {}): Effect => ({ op: 'script', kind, ...extra });
const T = (ev: string, effects: Effect[], extra: Partial<TriggerDef> = {}): TriggerDef => ({ on: 'x', ev, label: extra.label ?? 'trigger', effects, ...extra });
const trig = (d: CardDef, ...ts: TriggerDef[]) => { (d.triggers ??= []).push(...ts); };
const YOUR_CREATURES: Filter = { types: ['Creature'], ctrl: 'you' };
const classN = (n: number): Cond => ({ k: 'ctrGE', kind: 'class', n });

const CONTRACT: TokenSpec = {
  name: 'Contract', colors: ['W'], types: ['Enchantment'], sub: ['Aura'],
  ext: {
    text: 'Whenever enchanted creature attacks, it gets +2/+0 until end of turn if it\'s attacking one of your opponents. Otherwise, its controller loses 2 life.',
    triggers: [{ on: 'x', ev: 'attacks', subj: 'attached', label: 'Contract', effects: [S('contractAtk')] }],
  },
};

export const SOC_SCRIPTS: Record<string, Record<string, Patch>> = {
  'Channel': {
    'until end of turn, any time you could activate a mana ability, you may pay 1 life. if you do, add {c}': d => { d.spell = { effects: [{ op: 'script', kind: 'channel' }] }; },
  },
  'Killian, Decisive Mentor': {
    'whenever one or more creatures that are enchanted by an aura you control attack, draw a card': d =>
      trig(d, T('youAttack', [S('killianDraw')], { pl: 'you', label: 'draw a card' })),
  },
  'Scriv, the Obligator': {
    'whenever ~ enters or attacks, create a white aura enchantment token named contract attached to target creature an opponent controls. the token has enchant creature and "whenever enchanted creature attacks, it gets +2/+0 until end of turn if it\'s attacking one of your opponents. otherwise, its controller loses 2 life."': d => {
      const fx: Effect[] = [S('scrivContract')];
      const slots: TSlot[] = [{ who: 'perm', f: { types: ['Creature'], ctrl: 'opp' }, harm: true }];
      trig(d, T('etb', fx, { subj: 'self', label: 'create Contract', tslots: slots }), T('attacks', fx, { subj: 'self', label: 'create Contract', tslots: slots }));
    },
  },
  'Rootha, Mastering the Moment': {
    "at the beginning of combat on your turn, if you've cast an instant or sorcery spell this turn, create an x/x blue and red elemental creature token with flying and haste, where x is the greatest mana value among instant and sorcery spells you've cast this turn": d =>
      trig(d, T('beginCombat', [S('roothaElem')], { pl: 'you', label: 'create Elemental' })),
  },
  'Muddle, the Ever-Changing': {
    'whenever you cast an instant or sorcery spell, ~ becomes a copy of up to one target nonlegendary creature you control until end of turn, except it has myriad': d =>
      trig(d, T('cast', [S('muddleCopy')], { pl: 'you', f: { types: ['Instant', 'Sorcery'] }, label: 'become a copy with myriad', tslots: [{ who: 'perm', f: { types: ['Creature'], ctrl: 'you', nonlegendary: true }, opt: true }] })),
  },
  'Excava, the Risen Past': {
    "whenever ~ attacks, return up to one target artifact, creature, or non-aura enchantment card with mana value 3 or less from your graveyard to the battlefield with a finality counter on it. it's a 1/1 spirit creature with flying in addition to its other types": d =>
      trig(d, T('attacks', [S('excavaReturn')], { subj: 'self', label: 'return a card with a finality counter', tslots: [{ who: 'card', zoneOwner: 'you', opt: true, f: { mvLE: 3, anyType: ['Artifact', 'Creature', 'Enchantment'] } }] })),
  },
  'Primo, the Unbounded': {
    'whenever one or more creatures you control with base power 0 deal combat damage to a player, create a 0/0 green and blue fractal creature token. put a number of +1/+1 counters on it equal to the damage dealt': d =>
      trig(d, T('combatBatch', [S('primoFractal')], { pl: 'you', label: 'create a Fractal' })),
  },
  'Stensian Sanguinist // Exsanguinate': {
    'whenever you attack, target creature gains deathtouch until end of turn. whenever that creature deals combat damage to a player this combat, ~ becomes prepared': d =>
      trig(d, T('youAttack', [
        { op: 'grant', who: 't0', kw: ['deathtouch'] },
        { op: 'watch', kind: 'combatDamagePlayer', who: 't0', until: 'combat' as never, text: '~ becomes prepared', sub: [{ op: 'prep', who: 'self', n: 1 }] },
      ], { pl: 'you', label: 'deathtouch, then prepare', tslots: [{ who: 'perm', f: { types: ['Creature'] } }] })),
  },
  'Yavimaya Bloomsage // Channel': {
    'at the beginning of your end step, put a +1/+1 counter on target creature you control. then if that creature has power 7 or greater, ~ becomes prepared': d =>
      trig(d, T('endStep', [{ op: 'addC', who: 't0', kind: '+1/+1', n: 1 }, S('prepIfPow', { n: 7 })], { pl: 'you', label: 'prepare if 7 power', tslots: [{ who: 'perm', f: YOUR_CREATURES, harm: false }] })),
  },
  'Intermediate Chirography': {
    'whenever you lose life for the first time each turn, put a +1/+1 counter on target creature you control': d =>
      trig(d, T('loseLife', [S('chirographyP1')], { pl: 'you', ifc: { k: 'firstLoseLife' }, label: 'put a +1/+1 counter', tslots: [{ who: 'perm', f: YOUR_CREATURES, harm: false }] })),
    'at the beginning of each end step, if a modified creature died under your control this turn, create a 2/1 white and black inkling creature token with flying': d =>
      trig(d, T('endStep', [S('chirographyInk')], { pl: 'any', ifc: { k: 'modDiedYou' }, label: 'create an Inkling' })),
  },
  'Advanced Reconstruction': {
    'at the beginning of your first main phase, mill a card, then exile a card from your graveyard at random. you may play the exiled card this turn': d =>
      trig(d, T('firstMain', [S('advReconMain')], { pl: 'you', label: 'mill, exile, and play' })),
    'spells you cast from anywhere other than your hand cost {2} less to cast': d => {
      (d.statics ??= []).push({ k: 'costLess', who: 'all', n: 2, fromNotHand: true, cond: classN(3) });
    },
  },
};


Object.assign(SOC_SCRIPTS, SOC_LEFTOVERS);
