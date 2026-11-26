/** Leftover Oracle scripts for Edge of Eternities Commander. Keys must match classify() unparsed lines. */
import type { CardDef, Effect, TriggerDef, TSlot, TokenSpec, Filter, ActAbility, Static } from './types';

type Patch = (d: CardDef) => void;
const S = (kind: string, extra: Partial<Effect> = {}): Effect => ({ op: 'script', kind, ...extra });
const T = (ev: string, effects: Effect[], extra: Partial<TriggerDef> = {}): TriggerDef => ({ on: 'x', ev, label: extra.label ?? 'trigger', effects, ...extra });
const trig = (d: CardDef, ...ts: TriggerDef[]) => { (d.triggers ??= []).push(...ts); };
const spell = (d: CardDef, effects: Effect[], tslots?: TSlot[]) => { const sp = (d.spell ??= { effects: [] }); sp.effects.push(...effects); if (tslots) sp.tslots = [...(sp.tslots ?? []), ...tslots]; };
const abil = (d: CardDef, a: ActAbility) => { (d.abilities ??= []).push(a); };
const st = (d: CardDef, s: Static) => { (d.statics ??= []).push(s); };

const LANDER: TokenSpec = { name: 'Lander', colors: [], types: ['Artifact'], preset: 'Lander' };
const BEAST: TokenSpec = { name: 'Beast', p: 4, t: 4, colors: ['G'], types: ['Creature'], sub: ['Beast'] };
const INSECT: TokenSpec = { name: 'Insect', p: 1, t: 1, colors: ['B'], types: ['Creature'], sub: ['Insect'], kws: ['flying'] };
const GNOME: TokenSpec = { name: 'Gnome', p: 1, t: 1, colors: [], types: ['Artifact', 'Creature'], sub: ['Gnome'] };
const ANY: TSlot = { who: 'any', harm: true };
const CREATURE: TSlot = { who: 'perm', f: { types: ['Creature'] } };
const OTHER_CREATURE: TSlot = { who: 'perm', f: { types: ['Creature'], other: true }, opt: true };
const ARTIFACT: TSlot = { who: 'perm', f: { types: ['Artifact'] } };
const OTHER_ARTIFACT: TSlot = { who: 'perm', f: { types: ['Artifact'], other: true }, opt: true };
const PERM: TSlot = { who: 'perm' };
const GY_ART: TSlot = { who: 'card', f: { types: ['Artifact'] }, zoneOwner: 'you' };
const GY_LAND: TSlot = { who: 'card', f: { types: ['Land'] }, zoneOwner: 'any', opt: true };
const YOUR_NONLAND_PERM: Filter = { notTypes: ['Land'], ctrl: 'you' };

export const EOC_SCRIPTS: Record<string, Record<string, Patch>> = {
  'Kilo, Apogee Mind': {
    'whenever ~ becomes tapped, proliferate': d =>
      trig(d, T('becomesTapped', [{ op: 'proliferate' }], { subj: 'self', label: 'proliferate' })),
  },
  'Inspirit, Flagship Vessel': {
    '1+ | at the beginning of combat on your turn, put your choice of a +1/+1 counter or two charge counters on up to one other target artifact': d =>
      trig(d, T('beginCombat', [S('inspiritCtr')], { pl: 'you', ifc: { k: 'ctrGE', kind: 'charge', n: 1 }, label: 'choose +1/+1 or two charge counters', tslots: [OTHER_ARTIFACT] })),
  },
  'Szarel, Genesis Shepherd': {
    "whenever you sacrifice another nontoken permanent during your turn, put a number of +1/+1 counters equal to ~'s power on up to one other target creature": d =>
      trig(d, T('sacrificed', [{ op: 'addC', kind: '+1/+1', n: { pow: 'self' }, who: 't0' }], { pl: 'you', subj: 'any', f: { nontoken: true, other: true }, ifc: { k: 'yourTurn' }, label: "put +1/+1 counters equal to Szarel's power", tslots: [OTHER_CREATURE] })),
  },
  'Exploration Broodship': {
    'once during each of your turns, you may cast a permanent spell from your graveyard by sacrificing a land in addition to paying its other costs': d => { d.broodship = true; },
  },
  'Horizon Explorer': {
    'lands you control enter untapped': d => st(d, { k: 'landsUntapped', who: 'self' }),
    'whenever you attack a player, create a lander token': d =>
      trig(d, T('attackPlayer', [{ op: 'token', n: 1, pl: 'you', tok: LANDER }], { pl: 'you', label: 'create a Lander token' })),
  },
  'Patrolling Peacemaker': {
    'whenever an opponent commits a crime, proliferate': d =>
      trig(d, T('crime', [{ op: 'proliferate' }], { pl: 'opp', label: 'proliferate' })),
  },
  'Tekuthal, Inquiry Dominus': {
    'if you would proliferate, proliferate twice instead': d => st(d, { k: 'prolifTwice', who: 'self' }),
    '{1}{u/p}{u/p}, remove three counters from among other artifacts, creatures, and planeswalkers you control: put an indestructible counter on ~': d =>
      abil(d, { label: 'Put an indestructible counter on it', mana: { generic: 1, phy: ['U', 'U'] }, effects: [S('tekuthalInd')] }),
  },
  'Ripples of Potential': {
    'proliferate, then choose any number of permanents you control that had a counter put on them this way. those permanents phase out': d =>
      spell(d, [{ op: 'proliferate' }, S('ripplesPhase')]),
  },
  'Insight Engine': {
    '{2}, {t}: put a charge counter on ~, then draw a card for each charge counter on it': d =>
      abil(d, { label: 'Charge, then draw that many', mana: { generic: 2 }, tap: true, effects: [{ op: 'addC', kind: 'charge', n: 1, who: 'self' }, { op: 'draw', n: { ctr: 'charge', who: 'self' }, pl: 'you' }] }),
  },
  'Long-Range Sensor': {
    'whenever you attack a player, put a charge counter on ~': d =>
      trig(d, T('attackPlayer', [{ op: 'addC', kind: 'charge', n: 1, who: 'self' }], { pl: 'you', label: 'put a charge counter on it' })),
  },
  'Moxite Refinery': {
    '{2}, {t}, remove x counters from an artifact or creature you control: choose one. activate only as a sorcery.\n• put x charge counters on target artifact.\n• put x +1/+1 counters on target creature': d =>
      abil(d, { label: 'Move X counters', mana: { generic: 2 }, tap: true, sorcery: true, xFromMana: true, effects: [S('moxite')], modes: { min: 1, max: 1, list: [
        { label: 'Put X charge counters on target artifact', tslots: [ARTIFACT], effects: [{ op: 'addC', kind: 'charge', n: 'X', who: 't0' }] },
        { label: 'Put X +1/+1 counters on target creature', tslots: [CREATURE], effects: [{ op: 'addC', kind: '+1/+1', n: 'X', who: 't0' }] },
      ] } }),
  },
  'Darksteel Reactor': {
    'when ~ has twenty or more charge counters on it, you win the game': d => { d.winAtCharge = 20; },
  },
  'Solar Array': {
    '{t}: add one mana of any color. when you next cast an artifact spell this turn, that spell gains sunburst': d =>
      abil(d, { label: 'Add one mana of any color; next artifact spell gains sunburst', manaAb: true, tap: true, effects: [{ op: 'addMana', mana: ['ANY'], n: 1 }, S('solarGrant')] }),
  },
  'Pentad Prism': {
    'sunburst': d => { d.sunburst = true; },
  },
  'Etched Oracle': {
    'sunburst': d => { d.sunburst = true; },
    '{1}, remove four +1/+1 counters from ~: target player draws three cards': d =>
      abil(d, { label: 'Target player draws three cards', mana: { generic: 1 }, remC: { kind: '+1/+1', n: 4 }, tslots: [{ who: 'player' }], effects: [{ op: 'draw', n: 3, pl: 't0' }] }),
  },
  'Crystalline Crawler': {
    'converge — ~ enters with a +1/+1 counter on it for each color of mana spent to cast it': d => { d.sunburst = true; },
  },
  'Lux Artillery': {
    'whenever you cast an artifact creature spell, it gains sunburst': d =>
      trig(d, T('cast', [S('grantSunburst')], { pl: 'you', f: { types: ['Artifact', 'Creature'] }, label: 'that spell gains sunburst' })),
    'at the beginning of your end step, if there are thirty or more counters among artifacts and creatures you control, ~ deals 10 damage to each opponent': d =>
      trig(d, T('endStep', [S('luxBoom')], { pl: 'you', label: 'deal 10 to each opponent' })),
  },
  'Oracle of Mul Daya': {
    'play with the top card of your library revealed': d => st(d, { k: 'topLook', who: 'self' }),
  },
  'Dakmor Salvage': {
    'dredge 2': d => { d.dredge = 2; },
  },
  'Baloth Prime': {
    '~ enters tapped with six stun counters on it': d => { d.etbTapped = true; d.etbCounters = { kind: 'stun', n: 6 }; },
  },
  'Fumigate': {
    'destroy all creatures. you gain 1 life for each creature destroyed this way': d =>
      spell(d, [S('fumigate')]),
  },
  'Mayhem Devil': {
    'whenever a player sacrifices a permanent, ~ deals 1 damage to any target': d =>
      trig(d, T('sacrificed', [{ op: 'dmg', n: 1, who: 't0' }], { pl: 'any', subj: 'any', label: 'deals 1 damage to any target', tslots: [ANY] })),
  },
  'Planetary Annihilation': {
    'each player chooses six lands they control, then sacrifices the rest. ~ deals 6 damage to each creature': d =>
      spell(d, [S('planetary'), { op: 'dmg', n: 6, who: { all: { types: ['Creature'] } } }]),
  },
  'Eumidian Wastewaker': {
    'whenever ~ attacks, you and defending player each discard a card or sacrifice a permanent. you draw a card for each land card put into a graveyard this way': d =>
      trig(d, T('attacks', [S('wastewaker')], { subj: 'self', label: 'each discards or sacrifices' })),
  },
  'Evendo Brushrazer': {
    'whenever you sacrifice a nontoken permanent, exile the top card of your library': d =>
      trig(d, T('sacrificed', [S('evendoExile')], { pl: 'you', subj: 'any', f: { nontoken: true }, label: 'exile the top card of your library' })),
    "during your turn, as long as you've sacrificed a nontoken permanent this turn, you may play cards exiled with ~": d => { /* handled in evendoExile / evendoPlay */ },
  },
  'Eumidian Hatchery': {
    'when ~ is put into a graveyard from the battlefield, for each hatchling counter on it, create a 1/1 black insect creature token with flying': d =>
      trig(d, T('dies', [S('hatchery')], { subj: 'self', label: 'create Insects for each hatchling counter' })),
  },
  'Scouring Swarm': {
    "whenever you sacrifice a land, create a tapped token that's a copy of ~ if seven or more land cards are in your graveyard. otherwise, create a tapped 1/1 black insect creature token with flying": d =>
      trig(d, T('sacrificed', [S('scouring')], { pl: 'you', subj: 'any', f: { types: ['Land'] }, label: 'create a Swarm or an Insect' })),
  },
  'Formless Genesis': {
    'create an x/x colorless shapeshifter creature token with changeling and deathtouch, where x is the number of land cards in your graveyard': d =>
      spell(d, [S('formless')]),
  },
  'The Gitrog Monster': {
    'at the beginning of your upkeep, sacrifice ~ unless you sacrifice a land': d =>
      trig(d, T('upkeep', [S('gitrogSac')], { pl: 'you', label: 'sacrifice it unless you sacrifice a land' })),
    'whenever one or more land cards are put into your graveyard from anywhere, draw a card': d =>
      trig(d, T('enterGy', [{ op: 'draw', n: 1, pl: 'you' }], { pl: 'you', f: { types: ['Land'] }, batch: true, label: 'draw a card' })),
  },
  'Moraug, Fury of Akoum': {
    'each creature you control gets +1/+0 for each time it has attacked this turn': d => {},
    "landfall — whenever a land you control enters, if it's your main phase, there's an additional combat phase after this phase. at the beginning of that combat, untap all creatures you control": d =>
      trig(d, T('etb', [{ op: 'extraCombat' }, S('moraugUntap')], { pl: 'you', subj: 'any', f: { types: ['Land'], ctrl: 'you' }, ifc: { k: 'yourMain' }, label: 'additional combat, then untap' })),
  },
  'Soul of Windgrace': {
    'whenever ~ enters or attacks, you may put a land card from a graveyard onto the battlefield tapped under your control': d => {
      trig(d, T('etb', [S('windgraceLand')], { subj: 'self', label: 'you may put a land from a graveyard onto the battlefield tapped', tslots: [GY_LAND] }));
      trig(d, T('attacks', [S('windgraceLand')], { subj: 'self', label: 'you may put a land from a graveyard onto the battlefield tapped', tslots: [GY_LAND] }));
    },
    '{g}, discard a land card: you gain 3 life': d =>
      abil(d, { label: 'Gain 3 life', mana: { generic: 0, G: 1 }, effects: [S('discLand'), { op: 'gain', n: 3, pl: 'you' }] }),
    '{1}{r}, discard a land card: draw a card': d =>
      abil(d, { label: 'Draw a card', mana: { generic: 1, R: 1 }, effects: [S('discLand'), { op: 'draw', n: 1, pl: 'you' }] }),
    '{2}{b}, discard a land card: ~ gains indestructible until end of turn. tap it': d =>
      abil(d, { label: 'Indestructible and tap', mana: { generic: 2, B: 1 }, effects: [S('discLand'), { op: 'grant', who: 'self', kw: ['indestructible'] }, { op: 'tap', who: 'self' }] }),
  },
  'Loamcrafter Faun': {
    'when ~ enters, you may discard one or more land cards. when you do, return up to that many target nonland permanent cards from your graveyard to your hand': d =>
      trig(d, T('etb', [S('loamcrafter')], { subj: 'self', label: 'discard lands, return permanents' })),
  },
  'Centaur Vinecrasher': {
    '~ enters with a number of +1/+1 counters on it equal to the number of land cards in all graveyards': d => { d.etbCounters = { kind: '+1/+1', n: { cards: 'graveyard', pl: 'all', f: { types: ['Land'] } } as never }; },
    'whenever a land card is put into a graveyard from anywhere, you may pay {g}{g}. if you do, return ~ from your graveyard to your hand': d =>
      trig(d, T('enterGy', [S('vinecrasher')], { pl: 'any', f: { types: ['Land'] }, label: 'you may pay {G}{G} to return it to your hand' })),
  },
  'Escape to the Wilds': {
    'exile the top five cards of your library. you may play cards exiled this way until the end of your next turn': d =>
      spell(d, [S('escapeWilds')]),
  },
  'Braids, Arisen Nightmare': {
    "at the beginning of your end step, you may sacrifice an artifact, creature, enchantment, land, or planeswalker. if you do, each opponent may sacrifice a permanent that shares a card type with it. for each opponent who doesn't, that player loses 2 life and you draw a card": d =>
      trig(d, T('endStep', [S('braids')], { pl: 'you', label: 'you may sacrifice a permanent' })),
  },
  'Myriad Landscape': {
    '{2}, {t}, sacrifice ~: search your library for up to two basic land cards that share a land type, put them onto the battlefield tapped, then shuffle': d =>
      abil(d, { label: 'Search for two basics that share a type', mana: { generic: 2 }, tap: true, sac: true, effects: [S('myriadLand')] }),
  },
  "Windgrace's Judgment": {
    'for any number of opponents, destroy target nonland permanent that player controls': d =>
      spell(d, [S('windgraceJudge')]),
  },
  "Worldsoul's Rage": {
    '~ deals x damage to any target. put up to x land cards from your hand and/or graveyard onto the battlefield tapped': d =>
      spell(d, [{ op: 'dmg', n: 'X', who: 't0' }, S('worldsoul')], [ANY]),
  },
  'God-Eternal Bontu': {
    'when ~ enters, sacrifice any number of other permanents, then draw that many cards': d =>
      trig(d, T('etb', [S('bontuSac')], { subj: 'self', label: 'sacrifice any number, then draw that many' })),
    "when ~ dies or is put into exile from the battlefield, you may put her into her owner's library third from the top": d => {
      trig(d, T('dies', [S('bontuLib')], { subj: 'self', label: "you may put her third from the top" }));
      trig(d, T('exile', [S('bontuLib')], { subj: 'self', label: "you may put her third from the top" }));
    },
  },
  'Phyrexian Metamorph': {
    "you may have ~ enter as a copy of any artifact or creature on the battlefield, except it's an artifact in addition to its other types": d => { d.asEnters = [S('metamorph')]; },
  },
  'The Mycosynth Gardens': {
    '{x}, {t}: ~ becomes a copy of target nontoken artifact you control with mana value x': d =>
      abil(d, { label: 'Become a copy of a nontoken artifact', mana: { generic: 0, x: 1 }, tap: true, tslots: [{ who: 'perm', f: { types: ['Artifact'], nontoken: true, ctrl: 'you' } }], effects: [S('mycosynth')] }),
  },
  'Cloud Key': {
    'as ~ enters, choose artifact, creature, enchantment, instant, or sorcery': d => { d.asEnters = [...(d.asEnters ?? []), S('cloudKey')]; },
  },
  'Chrome Host Seedshark': {
    "whenever you cast a noncreature spell, incubate x, where x is that spell's mana value": d =>
      trig(d, T('cast', [S('seedshark')], { pl: 'you', f: { notTypes: ['Creature'] }, label: 'incubate X' })),
  },
  'Deepglow Skate': {
    'when ~ enters, double the number of each kind of counter on any number of target permanents': d =>
      trig(d, T('etb', [S('deepglow')], { subj: 'self', label: 'double counters on any number of permanents' })),
  },
  'Depthshaker Titan': {
    'when ~ enters, any number of target noncreature artifacts you control become 3/3 artifact creatures. sacrifice them at the beginning of the next end step': d =>
      trig(d, T('etb', [S('depthshaker')], { subj: 'self', label: 'animate any number of noncreature artifacts' })),
    'each artifact creature you control has melee, trample, and haste': d =>
      st(d, { k: 'kw', who: 'others', f: { types: ['Artifact', 'Creature'], ctrl: 'you' }, kws: ['melee', 'trample', 'haste'] }),
  },
  'Alibou, Ancient Witness': {
    'whenever one or more artifact creatures you control attack, ~ deals x damage to any target and you scry x, where x is the number of tapped artifacts you control': d =>
      trig(d, T('youAttack', [S('alibou')], { pl: 'you', ifc: { k: 'attacking' }, label: 'deal X and scry X', tslots: [ANY] })),
  },
  'Threefold Thunderhulk': {
    'whenever ~ enters or attacks, create a number of 1/1 colorless gnome artifact creature tokens equal to its power': d => {
      trig(d, T('etb', [{ op: 'token', n: { pow: 'self' }, pl: 'you', tok: GNOME }], { subj: 'self', label: 'create Gnomes equal to its power' }));
      trig(d, T('attacks', [{ op: 'token', n: { pow: 'self' }, pl: 'you', tok: GNOME }], { subj: 'self', label: 'create Gnomes equal to its power' }));
    },
  },
  'Emry, Lurker of the Loch': {
    '{t}: choose target artifact card in your graveyard. you may cast that card this turn': d =>
      abil(d, { label: 'You may cast an artifact from your graveyard this turn', tap: true, tslots: [GY_ART], effects: [S('emry')] }),
  },
  'Rakdos Charm': {
    "choose one —\n• exile target player's graveyard.\n• destroy target artifact.\n• each creature deals 1 damage to its controller": d => {
      const sp = (d.spell ??= { effects: [] });
      sp.modes = { min: 1, max: 1, list: [
        { label: "Exile target player's graveyard", tslots: [{ who: 'player' }], effects: [S('exileGy')] },
        { label: 'Destroy target artifact', tslots: [ARTIFACT], effects: [{ op: 'destroy', who: 't0' }] },
        { label: 'Each creature deals 1 damage to its controller', effects: [S('rakdosCharm3')] },
      ] };
    },
  },
  'Gavel of the Righteous': {
    'equipped creature gets +1/+1 for each counter on ~': d => {},
    'as long as ~ has four or more counters on it, equipped creature has double strike': d => {},
    'equip—pay {3} or remove a counter from ~': d =>
      abil(d, { label: 'Equip', sorcery: true, equip: true, tslots: [{ who: 'perm', f: { types: ['Creature'], ctrl: 'you' }, harm: false }], effects: [S('gavelEquip'), { op: 'attach', who: 'self', other: 't0' }] }),
  },
  'Multani, Yavimaya\'s Avatar': {
    '~ gets +1/+1 for each land you control and each land card in your graveyard': d => {},
    "{1}{g}, return two lands you control to their owner's hand: return ~ from your graveyard to your hand": d =>
      abil(d, { label: 'Return it to your hand', mana: { generic: 1, G: 1 }, zone: 'graveyard', effects: [S('multaniRet')] }),
  },
  'Sprouting Goblin': {
    'when ~ enters, if it was kicked, search your library for a land card with a basic land type, reveal it, put it into your hand, then shuffle': d =>
      trig(d, T('etb', [{ op: 'search', n: 1, f: { types: ['Land'] }, dest: 'hand', text: 'land card with a basic land type' }], { subj: 'self', ifc: { k: 'kicked' }, label: 'search for a land with a basic land type' })),
  },
};

void YOUR_NONLAND_PERM;
void BEAST;
