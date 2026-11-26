/** Leftover Oracle scripts for Foundations Commander. Keys must match classify() unparsed lines. */
import type { CardDef, Effect, TriggerDef, TSlot, TokenSpec, Filter, ActAbility, Static, Cost } from './types';

type Patch = (d: CardDef) => void;
const S = (kind: string, extra: Partial<Effect> = {}): Effect => ({ op: 'script', kind, ...extra });
const T = (ev: string, effects: Effect[], extra: Partial<TriggerDef> = {}): TriggerDef => ({ on: 'x', ev, label: extra.label ?? 'trigger', effects, ...extra });
const trig = (d: CardDef, ...ts: TriggerDef[]) => { (d.triggers ??= []).push(...ts); };
const spell = (d: CardDef, effects: Effect[], tslots?: TSlot[]) => { const sp = (d.spell ??= { effects: [] }); sp.effects.push(...effects); if (tslots) sp.tslots = [...(sp.tslots ?? []), ...tslots]; };
const abil = (d: CardDef, a: ActAbility) => { (d.abilities ??= []).push(a); };
const st = (d: CardDef, s: Static) => { (d.statics ??= []).push(s); };
const mana = (d: CardDef, m: NonNullable<CardDef['mana']>[number]) => { (d.mana ??= []).push(m); };

const ZOMBIE: TokenSpec = { name: 'Zombie', p: 2, t: 2, colors: ['B'], types: ['Creature'], sub: ['Zombie'] };
const ANGEL: TokenSpec = { name: 'Angel', p: 4, t: 4, colors: ['W'], types: ['Creature'], sub: ['Angel'], kws: ['flying'] };
const SPIDER: TokenSpec = { name: 'Spider', p: 1, t: 2, colors: ['G'], types: ['Creature'], sub: ['Spider'], kws: ['reach'] };
const BEAST: TokenSpec = { name: 'Phyrexian Beast', p: 4, t: 4, colors: ['G'], types: ['Creature'], sub: ['Phyrexian', 'Beast'] };
const DRAGON: TokenSpec = { name: 'Dragon', p: 4, t: 4, colors: ['R'], types: ['Creature'], sub: ['Dragon'], kws: ['flying'] };
const TREASURE: TokenSpec = { name: 'Treasure', colors: [], types: ['Artifact'], preset: 'Treasure' };
const ANY: TSlot = { who: 'any', harm: true };
const CREATURE: TSlot = { who: 'perm', f: { types: ['Creature'] } };
const YOUR_CREATURE: TSlot = { who: 'perm', f: { types: ['Creature'], ctrl: 'you' } };
const OPP_CREATURE: TSlot = { who: 'perm', f: { types: ['Creature'], ctrl: 'opp' }, harm: true };
const NONLAND: TSlot = { who: 'perm', f: { notTypes: ['Land'] }, harm: true };
const ATTACKER: TSlot = { who: 'perm', f: { types: ['Creature'], attacking: true } };
const GY_CREATURE: TSlot = { who: 'card', f: { types: ['Creature'] }, zoneOwner: 'you' };
const YOUR_ART: Filter = { types: ['Artifact'], ctrl: 'you' };
const eachOpp = (f: Filter, opt = true): TSlot[] => [0, 1, 2].map(i => ({ who: 'perm' as const, f, opt, oppIdx: i, harm: true }));

export const FDC_SCRIPTS: Record<string, Record<string, Patch>> = {
  'All Is Dust': {
    'each player sacrifices all permanents they control that are one or more colors': d => spell(d, [S('allIsDust')]),
  },
  'Angelic Field Marshal': {
    'lieutenant — as long as you control your commander, ~ gets +2/+2 and creatures you control have vigilance': d => {
      st(d, { k: 'pt', who: 'self', p: 2, t: 2, cond: { k: 'ctlCommander' } });
      st(d, { k: 'kw', who: 'all', f: { types: ['Creature'], ctrl: 'you' }, kws: ['vigilance'], cond: { k: 'ctlCommander' } });
    },
  },
  'Angelic Sleuth': {
    'whenever another permanent you control leaves the battlefield, if it had counters on it, investigate': d =>
      trig(d, T('ltb', [S('sleuthInv')], { subj: 'any', f: { ctrl: 'you', other: true }, label: 'investigate' })),
  },
  'Arachnogenesis': {
    'create x 1/2 green spider creature tokens with reach, where x is the number of creatures attacking you. prevent all combat damage that would be dealt this turn by non-spider creatures': d =>
      spell(d, [S('arachnogenesis')]),
  },
  'Archangel of Tithes': {
    "as long as ~ is untapped, creatures can't attack you or planeswalkers you control unless their controller pays {1} for each of those creatures": d =>
      st(d, { k: 'propaganda', who: 'self', n: 1, cond: { k: 'untapped' } }),
    "as long as ~ is attacking, creatures can't block unless their controller pays {1} for each of those creatures": d =>
      st(d, { k: 'taxAct', who: 'self', n: 1, cond: { k: 'attacking' } }),
  },
  'Breaching Dragonstorm': {
    "when ~ enters, exile cards from the top of your library until you exile a nonland card. you may cast it without paying its mana cost if that spell's mana value is 8 or less. if you don't, put that card into your hand": d =>
      trig(d, T('etb', [S('breachStorm')], { subj: 'self', label: 'impulse a nonland (MV 8 or less, free)' })),
  },
  'Carnelian Orb of Dragonkind': {
    '{t}: add {r}. if that mana is spent on a dragon creature spell, it gains haste until end of turn': d =>
      mana(d, { add: ['R'], only: 'dragonHaste' }),
  },
  'Challenger Troll': {
    "each creature you control with power 4 or greater can't be blocked by more than one creature": d =>
      st(d, { k: 'blockMax1', who: 'all', f: { types: ['Creature'], ctrl: 'you', powGE: 4 } }),
  },
  "Chandra's Ignition": {
    'target creature you control deals damage equal to its power to each other creature and each opponent': d =>
      spell(d, [S('chandrasIgnition')], [YOUR_CREATURE]),
  },
  'Clifftop Lookout': {
    'when ~ enters, reveal cards from the top of your library until you reveal a land card. put that card onto the battlefield tapped and the rest on the bottom of your library in a random order': d =>
      trig(d, T('etb', [S('clifftop')], { subj: 'self', label: 'reveal until a land, put it onto the battlefield tapped' })),
  },
  'Collective Resistance': {
    'escalate {g}': d => { d.escalateCost = { generic: 0, G: 1 }; if (d.spell?.modes) d.spell.modes.escalateCost = d.escalateCost; },
  },
  'Consumed by Greed': {
    'gift a card': d => { d.gift = 'card'; },
    'target opponent sacrifices a creature with the greatest power among creatures they control. if the gift was promised, return target creature card from your graveyard to your hand': d =>
      spell(d, [S('consumedGreed')], [{ who: 'opp', harm: true }, { ...GY_CREATURE, opt: true }]),
  },
  'Death Baron': {
    'skeletons you control and other zombies you control get +1/+1 and have deathtouch': d => {
      st(d, { k: 'pt', who: 'all', f: { types: ['Skeleton'], ctrl: 'you' }, p: 1, t: 1 });
      st(d, { k: 'kw', who: 'all', f: { types: ['Skeleton'], ctrl: 'you' }, kws: ['deathtouch'] });
      st(d, { k: 'pt', who: 'all', f: { types: ['Zombie'], ctrl: 'you', other: true }, p: 1, t: 1 });
      st(d, { k: 'kw', who: 'all', f: { types: ['Zombie'], ctrl: 'you', other: true }, kws: ['deathtouch'] });
    },
  },
  'Diregraf Colossus': {
    '~ enters with a +1/+1 counter on it for each zombie card in your graveyard': d => { d.etbCounters = { kind: '+1/+1', n: { count: { types: ['Zombie'] }, zone: 'graveyard', pl: 'you' } }; },
  },
  "Dragonhawk, Fate's Tempest": {
    'whenever ~ enters or attacks, exile the top x cards of your library, where x is the number of creatures you control with power 4 or greater. you may play those cards until your next end step. at the beginning of your next end step, ~ deals 2 damage to each opponent for each of those cards that are still exiled': d =>
      trig(d, T('etb', [S('dragonhawk')], { subj: 'self', label: "Dragonhawk's tempest" }),
           T('attacks', [S('dragonhawk')], { subj: 'self', label: "Dragonhawk's tempest" })),
  },
  'Dragonstorm Globe': {
    'each dragon you control enters with an additional +1/+1 counter on it': d =>
      st(d, { k: 'etbTypalCtr', who: 'self', f: { types: ['Dragon'] }, n: 1 }),
  },
  'Drakuseth, Maw of Flames': {
    'whenever ~ attacks, ~ deals 4 damage to any target and 3 damage to each of up to two other targets': d =>
      trig(d, T('attacks', [{ op: 'damage', who: 't0', n: 4 }, { op: 'damage', who: 't1', n: 3 }, { op: 'damage', who: 't2', n: 3 }], {
        subj: 'self', label: '4 damage and 3 to up to two others',
        tslots: [ANY, { ...ANY, opt: true, distinct: true }, { ...ANY, opt: true, distinct: true }],
      })),
  },
  'Duplicant': {
    'as long as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the last creature card exiled with it. it\'s still a shapeshifter': d => { d.imprint = true; },
  },
  'Emeria Shepherd': {
    'landfall — whenever a land you control enters, you may return target nonland permanent card from your graveyard to your hand. if that land is a plains, you may return that nonland permanent card to the battlefield instead': d =>
      trig(d, T('etb', [S('emeria')], { subj: 'any', f: { types: ['Land'], ctrl: 'you' }, label: 'return a nonland permanent card from your graveyard', tslots: [{ who: 'card', f: { notTypes: ['Land'] }, zoneOwner: 'you', opt: true }] })),
  },
  'Endless Atlas': {
    '{2}, {t}: draw a card. activate only if you control three or more lands with the same name': d =>
      abil(d, { label: 'Draw a card', mana: { generic: 2 }, tap: true, effects: [S('atlasDraw')] }),
  },
  'Endless Ranks of the Dead': {
    'at the beginning of your upkeep, create x 2/2 black zombie creature tokens, where x is half the number of zombies you control, rounded down': d =>
      trig(d, T('upkeep', [S('endlessRanks')], { pl: 'you', label: 'create Zombies equal to half your Zombies' })),
  },
  'Exemplar of Light': {
    'whenever you put one or more +1/+1 counters on ~, draw a card. this ability triggers only once each turn': d =>
      trig(d, T('counterPut', [{ op: 'draw', n: 1, pl: 'you' }], { subj: 'self', f: { ctr: '+1/+1' }, once: true, label: 'draw a card' })),
  },
  "Ezuri's Predation": {
    'for each creature your opponents control, create a 4/4 green phyrexian beast creature token. each of those tokens fights a different one of those creatures': d =>
      spell(d, [S('ezuriPred')]),
  },
  'Fall from Favor': {
    "enchanted creature doesn't untap during its controller's untap step unless that player is the monarch": d =>
      st(d, { k: 'doesntUntap', who: 'attached', cond: { k: 'not', c: { k: 'monarch' } } }),
  },
  'Fateful Absence': {
    'destroy target creature or planeswalker. its controller investigates': d =>
      spell(d, [{ op: 'destroy', who: 't0' }, S('fatefulInv')], [{ who: 'perm', f: { anyType: ['Creature', 'Planeswalker'] }, harm: true }]),
  },
  'Firespitter Whelp': {
    'whenever you cast a noncreature or dragon spell, ~ deals 1 damage to each opponent': d =>
      trig(d, T('cast', [S('firespitter')], { pl: 'you', label: '1 damage to each opponent' })),
  },
  'Giada, Font of Hope': {
    'each other angel you control enters with an additional +1/+1 counter on it for each angel you already control': d =>
      st(d, { k: 'etbTypalCtr', who: 'self', f: { types: ['Angel'] }, kws: ['Angel'] }),
    '{t}: add {w}. spend this mana only to cast an angel spell': d => mana(d, { add: ['W'], only: 'angel' }),
  },
  'Goddric, Cloaked Reveler': {
    'celebration — as long as two or more nonland permanents entered the battlefield under your control this turn, ~ is a dragon with base power and toughness 4/4, flying, and "{r}: dragons you control get +1/+0 until end of turn."': d => {
      st(d, { k: 'basePT', who: 'self', p: 4, t: 4, cond: { k: 'celebration' } });
      st(d, { k: 'kw', who: 'self', kws: ['flying'], cond: { k: 'celebration' } });
      st(d, { k: 'addSub', who: 'self', kws: ['Dragon'], cond: { k: 'celebration' } });
      st(d, { k: 'grantAbil', who: 'self', cond: { k: 'celebration' }, grant: { abilities: [{ label: 'Dragons get +1/+0', mana: { generic: 0, R: 1 }, effects: [{ op: 'pump', who: { all: { types: ['Dragon'], ctrl: 'you' } }, n: 1, m: 0, until: 'eot' }] }] } });
    },
  },
  'Goreclaw, Terror of Qal Sisma': {
    'creature spells you cast with power 4 or greater cost {2} less to cast': d =>
      st(d, { k: 'costLess', who: 'self', n: 2, spellF: { types: ['Creature'], powGE: 4 } }),
  },
  'Graaz, Unstoppable Juggernaut': {
    "juggernauts you control can't be blocked by walls": d =>
      st(d, { k: 'cantBeBlockedBy', who: 'all', f: { types: ['Juggernaut'], ctrl: 'you' }, spellF: { types: ['Wall'] } }),
    'other creatures you control have base power and toughness 5/3 and are juggernauts in addition to their other creature types': d => {
      st(d, { k: 'basePT', who: 'all', f: { types: ['Creature'], ctrl: 'you', other: true }, p: 5, t: 3 });
      st(d, { k: 'addSub', who: 'all', f: { types: ['Creature'], ctrl: 'you', other: true }, kws: ['Juggernaut'] });
    },
  },
  'Grasp of Fate': {
    'when ~ enters, for each opponent, exile up to one target nonland permanent that player controls until ~ leaves the battlefield': d =>
      trig(d, T('etb', [S('rings')], { subj: 'self', label: 'exile up to one nonland of each opponent until this leaves', tslots: eachOpp({ notTypes: ['Land'] }) })),
  },
  'Gravecrawler': {
    'you may cast ~ from your graveyard as long as you control a zombie': d => { d.gyCast = 'zombie'; },
  },
  'Haven of the Spirit Dragon': {
    '{t}: add one mana of any color. spend this mana only to cast a dragon creature spell': d =>
      mana(d, { add: ['ANY'], only: 'dragonCreature' }),
    '{2}, {t}, sacrifice ~: return target dragon creature card or ugin planeswalker card from your graveyard to your hand': d =>
      abil(d, { label: 'Return a Dragon or Ugin', mana: { generic: 2 }, tap: true, sac: true, tslots: [{ who: 'card', zoneOwner: 'you' }], effects: [S('havenRet')] }),
  },
  'Herald of War': {
    'angel spells and human spells you cast cost {1} less to cast for each +1/+1 counter on ~': d => {
      st(d, { k: 'costLess', who: 'self', p: { ctr: '+1/+1', who: 'self' }, spellF: { types: ['Angel'] } });
      st(d, { k: 'costLess', who: 'self', p: { ctr: '+1/+1', who: 'self' }, spellF: { types: ['Human'] } });
    },
  },
  'Hit the Mother Lode': {
    "discover 10. if the discovered card's mana value is less than 10, create a number of tapped treasure tokens equal to the difference": d =>
      spell(d, [{ op: 'discover', n: 10 }, S('motherLode')]),
  },
  'Ichor Wellspring': {
    'when ~ enters or is put into a graveyard from the battlefield, draw a card': d => {
      trig(d, T('etb', [{ op: 'draw', n: 1, pl: 'you' }], { subj: 'self', label: 'draw a card' }));
      trig(d, T('dies', [{ op: 'draw', n: 1, pl: 'you' }], { subj: 'self', label: 'draw a card' }));
    },
  },
  'Kalitas, Traitor of Ghet': {
    'if a nontoken creature an opponent controls would die, instead exile that card and create a 2/2 black zombie creature token': d => { d.kalitas = true; },
  },
  "Kenrith's Transformation": {
    'enchanted creature loses all abilities and is a green elk creature with base power and toughness 3/3': d =>
      st(d, { k: 'basePT', who: 'attached', p: 3, t: 3, kws: ['Elk'], colors: ['G'] } as Static),
  },
  'Leyline Tyrant': {
    "you don't lose unspent red mana as steps and phases end": d => st(d, { k: 'manaPersistColor', who: 'self', color: 'R' }),
    'when ~ dies, you may pay any amount of {r}. when you do, it deals that much damage to any target': d =>
      trig(d, T('dies', [S('leylineDie')], { subj: 'self', label: 'pay any amount of {R} for damage', tslots: [ANY] })),
  },
  'Linvala, the Preserver': {
    'when ~ enters, if an opponent has more life than you, you gain 5 life': d =>
      trig(d, T('etb', [S('linvalaLife')], { subj: 'self', label: 'if an opponent has more life, gain 5' })),
  },
  'Loot, Exuberant Explorer': {
    '{4}{g}{g}, {t}: look at the top six cards of your library. you may reveal a creature card with mana value less than or equal to the number of lands you control from among them and put it onto the battlefield. put the rest on the bottom in a random order': d =>
      abil(d, { label: "Loot's expedition", mana: { generic: 4, G: 2 }, tap: true, effects: [S('lootExplore')] }),
  },
  'Master Transmuter': {
    "{u}, {t}, return an artifact you control to its owner's hand: you may put an artifact card from your hand onto the battlefield": d =>
      abil(d, { label: 'Transmute', mana: { generic: 0, U: 1 }, tap: true, tslots: [{ who: 'perm', f: YOUR_ART }], effects: [S('transmuter')] }),
  },
  'Mazemind Tome': {
    'when there are four or more page counters on ~, exile it. if you do, you gain 4 life': d =>
      trig(d, T('counterPut', [S('mazeTome')], { subj: 'self', ifc: { k: 'ctrGE', kind: 'page', n: 4 }, label: 'exile and gain 4 life' })),
  },
  'Metropolis Reformer': {
    'whenever ~ is dealt damage, you gain that much life': d =>
      trig(d, T('dealtDamage', [S('metroLife')], { subj: 'self', label: 'gain that much life' })),
  },
  'Minion of the Mighty': {
    'pack tactics — whenever ~ attacks, if you attacked with creatures with total power 6 or greater this combat, you may put a dragon creature card from your hand onto the battlefield tapped and attacking': d =>
      trig(d, T('attacks', [S('packTactics')], { subj: 'self', ifc: { k: 'atkGE', n: 6 }, label: 'pack tactics: put a Dragon onto the battlefield' })),
  },
  'Misleading Signpost': {
    'when ~ enters during the declare attackers step, you may reselect which player or permanent target attacking creature is attacking': d =>
      trig(d, T('etb', [S('signpost')], { subj: 'self', ifc: { k: 'attackersStep' }, label: 'reselect an attacker\'s defender', tslots: [{ ...ATTACKER, opt: true }] })),
  },
  'Monstrous Onslaught': {
    "~ deals x damage divided as you choose among any number of target creatures, where x is the greatest power among creatures you control as you cast ~": d =>
      spell(d, [S('monstrousOnslaught')]),
  },
  'Myr Battlesphere': {
    "whenever ~ attacks, you may tap x untapped myr you control. if you do, ~ gets +x/+0 until end of turn and deals x damage to the player or planeswalker it's attacking": d =>
      trig(d, T('attacks', [S('myrSphere')], { subj: 'self', label: 'tap Myr for +X/+0 and damage' })),
  },
  'Nogi, Draco-Zealot': {
    'whenever ~ attacks, if you control three or more dragons, until end of turn, ~ becomes a dragon with base power and toughness 5/5 and gains flying': d =>
      trig(d, T('attacks', [S('nogiAtk')], { subj: 'self', ifc: { k: 'control', f: { types: ['Dragon'] }, n: 3 }, label: 'become a 5/5 Dragon with flying' })),
  },
  "Norn's Choirmaster": {
    'whenever a commander you control enters or attacks, proliferate': d => {
      trig(d, T('etb', [{ op: 'proliferate' }], { subj: 'any', f: { cmdr: 'own', ctrl: 'you' }, label: 'proliferate' }));
      trig(d, T('attacks', [{ op: 'proliferate' }], { subj: 'any', f: { cmdr: 'own', ctrl: 'you' }, label: 'proliferate' }));
    },
  },
  'Orb of Dragonkind': {
    '{1}, {t}: add two mana in any combination of colors. spend this mana only to cast dragon spells or activate abilities of dragons': d =>
      abil(d, { label: 'Dragon mana', mana: { generic: 1 }, tap: true, manaAb: true, effects: [S('orbDragonMana')] }),
  },
  'Outpost Siege': {
    'as ~ enters, choose khans or dragons.\n• khans — at the beginning of your upkeep, exile the top card of your library. until end of turn, you may play that card.\n• dragons — whenever a creature you control leaves the battlefield, ~ deals 1 damage to any target': d => {
      d.asEnters = [S('outpostChoose')];
      trig(d, T('upkeep', [S('outpostKhans')], { pl: 'you', label: 'Khans: exile the top card, you may play it this turn' }));
      trig(d, T('ltb', [S('outpostDragons')], { subj: 'any', f: { types: ['Creature'], ctrl: 'you' }, label: 'Dragons: 1 damage', tslots: [ANY] }));
    },
  },
  'Oversold Cemetery': {
    'at the beginning of your upkeep, if you have four or more creature cards in your graveyard, you may return target creature card from your graveyard to your hand': d =>
      trig(d, T('upkeep', [{ op: 'move', who: 't0', dest: 'hand' }], { pl: 'you', ifc: { k: 'gyGE', f: { types: ['Creature'] }, n: 4 }, label: 'return a creature card to your hand', tslots: [{ ...GY_CREATURE, opt: true }] })),
  },
  'Padeem, Consul of Innovation': {
    'at the beginning of your upkeep, if you control the artifact with the greatest mana value or tied for the greatest mana value, draw a card': d =>
      trig(d, T('upkeep', [S('padeemDraw')], { pl: 'you', label: 'draw a card' })),
  },
  'Paradise Druid': {
    "~ has hexproof as long as it's untapped": d => st(d, { k: 'kw', who: 'self', kws: ['hexproof'], cond: { k: 'untapped' } }),
  },
  'Parapet Thrasher': {
    "whenever one or more dragons you control deal combat damage to an opponent, choose one that hasn't been chosen this turn —\n• destroy target artifact that opponent controls.\n• ~ deals 4 damage to each other opponent.\n• exile the top card of your library. you may play it this turn": d =>
      trig(d, T('combatDamage', [S('parapet')], { subj: 'any', f: { types: ['Dragon'], ctrl: 'you' }, label: "Parapet Thrasher's raid" })),
  },
  'Pugnacious Hammerskull': {
    "whenever ~ attacks while you don't control another dinosaur, put a stun counter on it": d =>
      trig(d, T('attacks', [S('hammerStun')], { subj: 'self', label: 'stun if you have no other Dinosaur' })),
  },
  'Ram Through': {
    "target creature you control deals damage equal to its power to target creature you don't control. if the creature you control has trample, excess damage is dealt to that creature's controller instead": d =>
      spell(d, [S('ramThrough')], [YOUR_CREATURE, { who: 'perm', f: { types: ['Creature'], ctrl: 'opp' }, harm: true }]),
  },
  'Razorlash Transmogrant': {
    '{4}{b}{b}: return ~ from your graveyard to the battlefield with a +1/+1 counter on it. this ability costs {4} less to activate if an opponent controls four or more nonbasic lands': d =>
      abil(d, { label: 'Return with a +1/+1 counter', mana: { generic: 4, B: 2 }, zone: 'graveyard', effects: [S('razorlash')] }),
  },
  'Righteous Valkyrie': {
    'as long as you have at least 7 life more than your starting life total, creatures you control get +2/+2': d =>
      st(d, { k: 'pt', who: 'all', f: { types: ['Creature'], ctrl: 'you' }, p: 2, t: 2, cond: { k: 'lifeGE', n: 47 } }),
  },
  'Ripjaw Raptor': {
    'enrage — whenever ~ is dealt damage, draw a card': d =>
      trig(d, T('dealtDamage', [{ op: 'draw', n: 1, pl: 'you' }], { subj: 'self', label: 'enrage: draw a card' })),
  },
  "Rishkar's Expertise": {
    'you may cast a spell with mana value 5 or less from your hand without paying its mana cost': d =>
      spell(d, [S('rishkarExp')]),
  },
  'Rishkar, Peema Renegade': {
    'each creature you control with a counter on it has "{t}: add {g}."': d =>
      st(d, { k: 'grantMana', who: 'all', f: { types: ['Creature'], ctrl: 'you', anyCtr: true }, mana: [{ add: ['G'] }] }),
  },
  'Sarkhan, Dragon Ascendant': {
    'when ~ enters, you may behold a dragon. if you do, create a treasure token': d =>
      trig(d, T('etb', [S('sarkhanBehold')], { subj: 'self', label: 'behold a Dragon, create a Treasure' })),
    'whenever a dragon you control enters, put a +1/+1 counter on ~. until end of turn, ~ becomes a dragon in addition to his other types and gains flying': d =>
      trig(d, T('etb', [S('sarkhanDragon')], { subj: 'any', f: { types: ['Dragon'], ctrl: 'you' }, label: 'become a Dragon' })),
  },
  'Scourge of the Throne': {
    'dethrone': d => { d.dethrone = true; },
    "whenever ~ attacks for the first time each turn, if it's attacking the player with the most life or tied for most life, untap all attacking creatures. after this phase, there is an additional combat phase": d =>
      trig(d, T('attacks', [S('scourgeXtra')], { subj: 'self', ifc: { k: 'atkMostLife' }, once: true, label: 'untap attackers, extra combat' })),
  },
  'Scrapshooter': {
    'gift a card': d => { d.gift = 'card'; },
    'when ~ enters, if the gift was promised, destroy target artifact or enchantment an opponent controls': d =>
      trig(d, T('etb', [{ op: 'destroy', who: 't0' }], { subj: 'self', ifc: { k: 'giftPromised' }, label: 'destroy an artifact or enchantment', tslots: [{ who: 'perm', f: { anyType: ['Artifact', 'Enchantment'], ctrl: 'opp' }, opt: true, harm: true }] })),
  },
  "Sephara, Sky's Blade": {
    "you may pay {w} and tap four untapped creatures you control with flying rather than pay ~'s mana cost": d => { d.sepharaAlt = true; },
  },
  'Seraph of the Sword': {
    'prevent all combat damage that would be dealt to ~': d => st(d, { k: 'preventAttackers', who: 'self' }),
  },
  'Serra Avenger': {
    "you can't cast ~ during your first, second, or third turns of the game": d => { d.noCastTurns = 3; },
  },
  'Shimmer Myr': {
    'you may cast artifact spells as though they had flash': d => st(d, { k: 'flashSpell', who: 'self', spellF: { types: ['Artifact'] } }),
  },
  'Soulless One': {
    "~'s power and toughness are each equal to the number of zombies on the battlefield plus the number of zombie cards in all graveyards": d => st(d, { k: 'pt', who: 'self', p: { sum: [{ count: { types: ['Zombie'] } }, { count: { types: ['Zombie'] }, zone: 'graveyard' }] }, t: { sum: [{ count: { types: ['Zombie'] } }, { count: { types: ['Zombie'] }, zone: 'graveyard' }] } }),
  },
  'Speaker of the Heavens': {
    '{t}: create a 4/4 white angel creature token with flying. activate only if you have at least 7 life more than your starting life total and only as a sorcery': d =>
      abil(d, { label: 'Create an Angel', tap: true, sorcery: true, cond: { k: 'lifeGE', n: 47 }, effects: [{ op: 'token', n: 1, pl: 'you', tok: ANGEL }] }),
  },
  'Spinerock Knoll': {
    '{r}, {t}: you may play the exiled card without paying its mana cost if an opponent was dealt 7 or more damage this turn': d =>
      abil(d, { label: 'Play the exiled card', mana: { generic: 0, R: 1 }, tap: true, effects: [S('spinerock')] }),
  },
  'Spit Flame': {
    'whenever a dragon you control enters, you may pay {r}. if you do, return ~ from your graveyard to your hand': d =>
      trig(d, T('etb', [S('spitFlame')], { subj: 'any', f: { types: ['Dragon'], ctrl: 'you' }, label: 'pay {R}: return Spit Flame to hand' })),
  },
  'Steel Hellkite': {
    '{x}: destroy each nonland permanent with mana value x whose controller was dealt combat damage by ~ this turn. activate only once each turn': d =>
      abil(d, { label: 'Destroy MV X', mana: { generic: 0, x: 1 }, xFromMana: true, once: true, effects: [S('hellkiteX')] }),
  },
  'Surrak, the Hunt Caller': {
    'formidable — at the beginning of combat on your turn, if creatures you control have total power 8 or greater, target creature you control gains haste until end of turn': d =>
      trig(d, T('beginCombat', [S('surrakForm')], { pl: 'you', label: 'formidable: haste', tslots: [YOUR_CREATURE] })),
  },
  'Syphon Flesh': {
    'each other player sacrifices a creature. you create a 2/2 black zombie creature token for each creature sacrificed this way': d =>
      spell(d, [S('syphonFlesh')]),
  },
  "Tamiyo's Logbook": {
    '{5}{u}, {t}: draw a card. this ability costs {1} less to activate for each other artifact you control': d =>
      abil(d, { label: 'Draw a card', mana: { generic: 5, U: 1 }, tap: true, effects: [{ op: 'draw', n: 1, pl: 'you' }] }),
  },
  'Tangleweave Armor': {
    'equipped creature gets +x/+x, where x is the greatest mana value among your commanders': d =>
      st(d, { k: 'pt', who: 'attached', p: { mvMaxCmd: true }, t: { mvMaxCmd: true } }),
  },
  'The Elder Dragon War': {
    'read ahead': d => { d.readAhead = true; },
    'ii — discard any number of cards, then draw that many cards': d =>
      trig(d, T('chapter', [S('edwII')], { subj: 'self', ifc: { k: 'evAmt', n: 2 }, label: 'II — rummage any number' })),
  },
  'Thickest in the Thicket': {
    'at the beginning of your end step, draw two cards if you control the creature with the greatest power or tied for the greatest power': d =>
      trig(d, T('endStep', [S('thickest')], { pl: 'you', label: 'draw two cards' })),
  },
  'Thunderbreak Regent': {
    'whenever a dragon you control becomes the target of a spell or ability an opponent controls, ~ deals 3 damage to that player': d =>
      trig(d, T('targeted', [S('thunderbreak')], { subj: 'any', f: { types: ['Dragon'], ctrl: 'you' }, label: '3 damage to that player' })),
  },
  'Thundermane Dragon': {
    'you may cast creature spells with power 4 or greater from the top of your library. if you cast a creature spell this way, it gains haste until end of turn': d =>
      st(d, { k: 'topCast', who: 'self', spellF: { types: ['Creature'], powGE: 4 } }),
  },
  "Tyrant's Familiar": {
    'lieutenant — as long as you control your commander, ~ gets +2/+2 and has "whenever ~ attacks, it deals 7 damage to target creature defending player controls."': d => {
      st(d, { k: 'pt', who: 'self', p: 2, t: 2, cond: { k: 'ctlCommander' } });
      trig(d, T('attacks', [{ op: 'damage', who: 't0', n: 7 }], { subj: 'self', ifc: { k: 'ctlCommander' }, label: 'lieutenant: 7 damage', tslots: [{ who: 'perm', f: { types: ['Creature'], defP: true }, harm: true }] }));
    },
  },
  'Unnatural Growth': {
    'at the beginning of each combat, double the power and toughness of each creature you control until end of turn': d =>
      trig(d, T('beginCombat', [S('unnatural')], { label: 'double PT of your creatures' })),
  },
  'Vanguard Seraph': {
    'whenever you gain life for the first time each turn, surveil 1': d =>
      trig(d, T('gainLife', [S('vanguardSurveil')], { pl: 'you', label: 'surveil 1 the first time you gain life each turn' })),
  },
  'Whiptongue Hydra': {
    'when ~ enters, destroy all creatures with flying. put a +1/+1 counter on ~ for each creature destroyed this way': d =>
      trig(d, T('etb', [S('whiptongue')], { subj: 'self', label: 'destroy all with flying' })),
  },
  'Wight of Precinct Six': {
    "~ gets +1/+1 for each creature card in your opponents' graveyards": d =>
      st(d, { k: 'pt', who: 'self', p: { count: { types: ['Creature'] }, zone: 'graveyard', pl: 'opps' }, t: { count: { types: ['Creature'] }, zone: 'graveyard', pl: 'opps' } }),
  },
  "Witch's Clinic": {
    '{2}, {t}: target commander gains lifelink until end of turn': d =>
      abil(d, { label: 'Commander lifelink', mana: { generic: 2 }, tap: true, tslots: [{ who: 'perm', f: { cmdr: 'any' } }], effects: [{ op: 'grant', who: 't0', kw: ['lifelink'], until: 'eot' }] }),
  },
  'Wojek Investigator': {
    'at the beginning of your upkeep, investigate once for each opponent who has more cards in hand than you': d =>
      trig(d, T('upkeep', [S('wojek')], { pl: 'you', label: 'investigate for each opponent with a bigger hand' })),
  },
  "Yeva, Nature's Herald": {
    'you may cast green creature spells as though they had flash': d =>
      st(d, { k: 'flashSpell', who: 'self', spellF: { types: ['Creature'], colors: ['G'] } }),
  },
  'Zul Ashur, Lich Lord': {
    'ward—pay 2 life': d => { d.wardLife = 2; },
    '{t}: you may cast target zombie creature card from your graveyard this turn': d =>
      abil(d, { label: 'Cast a Zombie from your graveyard', tap: true, tslots: [{ who: 'card', f: { types: ['Zombie'] }, zoneOwner: 'you' }], effects: [S('zulCast')] }),
  },
};
