import type { CardDef, Effect, TriggerDef, TSlot, TokenSpec, Filter, ActAbility, Static } from './types';

type Patch = (d: CardDef) => void;
const S = (kind: string, extra: Partial<Effect> = {}): Effect => ({ op: 'script', kind, ...extra });
const T = (ev: string, effects: Effect[], extra: Partial<TriggerDef> = {}): TriggerDef => ({ on: 'x', ev, label: extra.label ?? 'trigger', effects, ...extra });
const trig = (d: CardDef, ...ts: TriggerDef[]) => { (d.triggers ??= []).push(...ts); };
const spell = (d: CardDef, effects: Effect[], tslots?: TSlot[]) => { const sp = (d.spell ??= { effects: [] }); sp.effects.push(...effects); if (tslots) sp.tslots = [...(sp.tslots ?? []), ...tslots]; };
const abil = (d: CardDef, a: ActAbility) => { (d.abilities ??= []).push(a); };

const ELF: TokenSpec = { name: 'Elf Warrior', p: 1, t: 1, colors: ['G'], types: ['Creature'], sub: ['Elf', 'Warrior'] };
const SNAKE: TokenSpec = { name: 'Snake', p: 1, t: 1, colors: ['G'], types: ['Creature'], sub: ['Snake'], kws: ['deathtouch'] };
const ELEMENTAL_RG: TokenSpec = { name: 'Elemental', p: 5, t: 5, colors: ['R', 'G'], types: ['Creature'], sub: ['Elemental'] };
const ELEMENTAL_W: TokenSpec = { name: 'Elemental', p: 4, t: 4, colors: ['W'], types: ['Creature'], sub: ['Elemental'], kws: ['flying'] };
const SAPROLING: TokenSpec = { name: 'Saproling', p: 1, t: 1, colors: ['G'], types: ['Creature'], sub: ['Saproling'] };
const RHINO: TokenSpec = { name: 'Rhino Warrior', p: 4, t: 4, colors: ['G'], types: ['Creature'], sub: ['Rhino', 'Warrior'] };
const TREASURE: TokenSpec = { name: 'Treasure', colors: [], types: ['Artifact'], preset: 'Treasure' };

const GY_CREATURE: TSlot = { who: 'card', f: { types: ['Creature'] }, zoneOwner: 'you' };
const GY_CREATURE_ANY: TSlot = { who: 'card', f: { types: ['Creature'] }, zoneOwner: 'any' };
const GY_CREATURE_OPP: TSlot = { who: 'card', f: { types: ['Creature'] }, zoneOwner: 'opp' };
const CREATURE: TSlot = { who: 'perm', f: { types: ['Creature'] } };

export const ECC_SCRIPTS: Record<string, Record<string, Patch>> = {
  'Ashling, the Limitless': {
    'whenever you sacrifice a nontoken elemental, create a token that\'s a copy of it. the token gains haste until end of turn. at the beginning of your next end step, sacrifice it unless you pay {w}{u}{b}{r}{g}': d =>
      trig(d, T('sacrificed', [S('ashlingCopy')], { pl: 'you', subj: 'any', f: { types: ['Elemental'], nontoken: true }, label: 'create a hasty token copy' })),
  },
  'Elemental Spectacle': {
    'vivid — create a number of 5/5 red and green elemental creature tokens equal to the number of colors among permanents you control. then you gain life equal to the number of creatures you control': d =>
      spell(d, [{ op: 'token', n: { permColors: true }, tok: ELEMENTAL_RG }, { op: 'gain', n: { count: { types: ['Creature'], ctrl: 'you' } }, pl: 'you' }]),
  },
  'Impulsivity': {
    'when ~ enters, you may cast target instant or sorcery card from a graveyard without paying its mana cost. if that spell would be put into a graveyard, exile it instead': d =>
      trig(d, T('etb', [S('impulsivity')], { subj: 'self', label: 'you may cast an instant or sorcery from a graveyard', tslots: [{ who: 'card', f: { anyType: ['Instant', 'Sorcery'] }, zoneOwner: 'any', opt: true }] })),
  },
  'Subterfuge': {
    'when ~ enters, target creature gains flying and "whenever ~ deals combat damage to a player, draw that many cards" until end of turn': d =>
      trig(d, T('etb', [{ op: 'grant', who: 't0', kw: ['flying'] }, S('subterfugeGrant')], { subj: 'self', label: 'grant flying and combat-draw', tslots: [CREATURE] })),
  },
  'Endurance': {
    'when ~ enters, up to one target player puts all the cards from their graveyard on the bottom of their library in a random order': d =>
      trig(d, T('etb', [S('enduranceGy')], { subj: 'self', label: "bottom a player's graveyard", tslots: [{ who: 'player', opt: true }] })),
  },
  'Fury': {
    'when ~ enters, it deals 4 damage divided as you choose among any number of target creatures and/or planeswalkers': d =>
      trig(d, T('etb', [S('divideDmg', { n: 4 })], { subj: 'self', label: '4 damage divided', tslots: Array.from({ length: 4 }, () => ({ who: 'perm' as const, f: { anyType: ['Creature', 'Planeswalker'] }, opt: true, harm: true, grp: 1 })) })),
  },
  'Haunting Voyage': {
    'choose a creature type. return up to two creature cards of that type from your graveyard to the battlefield. if ~ was foretold, return all creature cards of that type from your graveyard to the battlefield instead': d =>
      spell(d, [{ op: 'chooseType' }, S('hauntingVoyage')]),
  },
  'Cavalier of Thorns': {
    'when ~ enters, reveal the top five cards of your library. put a land card from among them onto the battlefield and the rest into your graveyard': d =>
      trig(d, T('etb', [{ op: 'look', n: 5, take: 1, f: { types: ['Land'] }, dest: 'battlefield', rest: 'graveyard', text: 'land card' }], { subj: 'self', label: 'put a land onto the battlefield' })),
  },
  'Selvala, Heart of the Wilds': {
    "whenever another creature enters, its controller may draw a card if its power is greater than each other creature's power": d =>
      trig(d, T('etb', [S('selvalaDraw')], { subj: 'other', f: { types: ['Creature'] }, label: 'its controller may draw' })),
  },
  'Titan of Industry': {
    'when ~ enters, choose two —\n• destroy target artifact or enchantment.\n• target player gains 5 life.\n• create a 4/4 green rhino warrior creature token.\n• put a shield counter on a creature you control': d =>
      trig(d, T('etb', [], { subj: 'self', label: 'choose two', modes: { min: 2, max: 2, list: [
        { label: 'Destroy target artifact or enchantment', tslots: [{ who: 'perm', f: { anyType: ['Artifact', 'Enchantment'] }, harm: true }], effects: [{ op: 'destroy', who: 't0' }] },
        { label: 'Target player gains 5 life', tslots: [{ who: 'player' }], effects: [{ op: 'gain', n: 5, pl: 't0' }] },
        { label: 'Create a 4/4 green Rhino Warrior', effects: [{ op: 'token', n: 1, tok: RHINO }] },
        { label: 'Put a shield counter on a creature you control', tslots: [{ who: 'perm', f: { types: ['Creature'], ctrl: 'you' } }], effects: [{ op: 'addC', kind: 'shield', n: 1, who: 't0' }] },
      ] } })),
  },
  'Shatter the Sky': {
    'each player who controls a creature with power 4 or greater draws a card. then destroy all creatures': d =>
      spell(d, [S('shatterSky'), { op: 'destroy', who: { all: { types: ['Creature'] } } }]),
  },
  'Hoofprints of the Stag': {
    '{2}{w}, remove four hoofprint counters from ~: create a 4/4 white elemental creature token with flying. activate only during your turn': d =>
      abil(d, { label: 'Create a 4/4 Elemental', mana: { generic: 2, W: 1 }, remC: { kind: 'hoofprint', n: 4 }, cond: { k: 'yourTurn' }, effects: [{ op: 'token', n: 1, tok: ELEMENTAL_W }] }),
  },
  'Slithermuse': {
    'when ~ leaves the battlefield, choose an opponent. if that player has more cards in hand than you, draw cards equal to the difference': d =>
      trig(d, T('ltb', [S('slithermuse')], { subj: 'self', label: 'draw the difference' })),
  },
  "Descendants' Fury": {
    'whenever one or more creatures you control deal combat damage to a player, you may sacrifice one of them. if you do, reveal cards from the top of your library until you reveal a creature card that shares a creature type with the sacrificed creature. put that card onto the battlefield and the rest on the bottom of your library in a random order': d =>
      trig(d, T('combatBatch', [S('descendantsFury')], { pl: 'you', f: { types: ['Creature'], ctrl: 'you' }, batch: true, label: 'you may sacrifice one to tutor a creature' })),
  },
  'Cream of the Crop': {
    "whenever a creature you control enters, you may look at the top x cards of your library, where x is that creature's power. if you do, put one of those cards on top of your library and the rest on the bottom of your library in any order": d =>
      trig(d, T('etb', [S('creamCrop')], { subj: 'any', f: { types: ['Creature'], ctrl: 'you' }, label: 'look at the top X' })),
  },
  'Kindred Summons': {
    'choose a creature type. reveal cards from the top of your library until you reveal x creature cards of the chosen type, where x is the number of creatures you control of that type. put those cards onto the battlefield, then shuffle the rest of the revealed cards into your library': d =>
      spell(d, [{ op: 'chooseType' }, S('kindredSummons')]),
  },
  'Faeburrow Elder': {
    '{t}: for each color among permanents you control, add one mana of that color': d =>
      abil(d, { label: 'Add mana of each color among permanents you control', tap: true, manaAb: true, effects: [S('faeburrowMana')] }),
  },
  'Horde of Notions': {
    '{w}{u}{b}{r}{g}: you may play target elemental card from your graveyard without paying its mana cost': d =>
      abil(d, { label: 'Play an Elemental from your graveyard', mana: { generic: 0, W: 1, U: 1, B: 1, R: 1, G: 1 }, tslots: [{ who: 'card', f: { types: ['Elemental'] }, zoneOwner: 'you' }], effects: [S('hordePlay')] }),
  },
  'Jegantha, the Wellspring': {
    "companion — no card in your starting deck has more than one of the same mana symbol in its mana cost": d => { /* deckbuilding restriction; companion is not a face commander in this precon */ },
  },
  'Shriekmaw': {
    'when ~ enters, destroy target nonartifact, nonblack creature': d =>
      trig(d, T('etb', [{ op: 'destroy', who: 't0' }], { subj: 'self', label: 'destroy a nonartifact, nonblack creature', tslots: [{ who: 'perm', f: { types: ['Creature'], notTypes: ['Artifact'], notColors: ['B'] }, harm: true }] })),
  },
  'Incandescent Soulstoke': {
    '{1}{r}, {t}: you may put an elemental creature card from your hand onto the battlefield. that creature gains haste until end of turn. sacrifice it at the beginning of the next end step': d =>
      abil(d, { label: 'Put an Elemental from your hand onto the battlefield', mana: { generic: 1, R: 1 }, tap: true, effects: [S('soulstoke')] }),
  },
  'Risen Reef': {
    "whenever ~ or another elemental you control enters, look at the top card of your library. if it's a land card, you may put it onto the battlefield tapped. if you don't put the card onto the battlefield, put it into your hand": d =>
      trig(d, T('etb', [S('risenReef')], { subj: 'any', f: { types: ['Elemental'], ctrl: 'you' }, label: 'look at the top card' })),
  },
  'Fertile Ground': {
    'whenever enchanted land is tapped for mana, its controller adds an additional one mana of any color': d =>
      trig(d, T('tappedForMana', [S('fertileGround')], { label: 'add one mana of any color' })),
  },
  'Auntie Ool, Cursewretch': {
    "whenever one or more -1/-1 counters are put on a creature, draw a card if you control that creature. if you don't control it, its controller loses 1 life": d =>
      trig(d, T('counterPut', [S('auntieOol')], { subj: 'any', f: { types: ['Creature'] }, kindF: '-1/-1', label: 'draw or drain' })),
  },
  'The Reaper, King No More': {
    'whenever a creature an opponent controls with a -1/-1 counter on it dies, you may put that card onto the battlefield under your control. do this only once each turn': d =>
      trig(d, T('dies', [S('reaperSteal')], { subj: 'any', f: { types: ['Creature'], ctrl: 'opp', ctr: '-1/-1' }, once: true, label: 'you may return it under your control' })),
  },
  "Eventide's Shadow": {
    'remove any number of counters from among permanents on the battlefield. you draw cards and lose life equal to the number of counters removed this way': d =>
      spell(d, [S('eventideShadow')]),
  },
  'Aberrant Return': {
    'put one, two, or three target creature cards from graveyards onto the battlefield under your control. each of them enters with an additional -1/-1 counter on it': d =>
      spell(d, [S('aberrantReturn')], Array.from({ length: 3 }, (_, i) => ({ who: 'card' as const, f: { types: ['Creature'] }, zoneOwner: 'any' as const, opt: i > 0, grp: 1 }))),
  },
  'Dread Tiller': {
    'whenever a creature with a -1/-1 counter on it dies, you may put a land card from your hand or graveyard onto the battlefield tapped': d =>
      trig(d, T('dies', [S('dreadTiller')], { subj: 'any', f: { types: ['Creature'], ctr: '-1/-1' }, label: 'you may put a land onto the battlefield tapped' })),
  },
  'Oft-Nabbed Goat': {
    '{1}: draw a card. gain control of ~ and put a -1/-1 counter on it. only your opponents may activate this ability and only as a sorcery': d =>
      abil(d, { label: "Draw, gain control, and put a -1/-1 counter", mana: { generic: 1 }, sorcery: true, oppOnly: true, effects: [S('oftNabbed')] }),
    'when ~ dies, if it had one or more -1/-1 counters on it, its owner draws that many cards and each other player loses that much life': d =>
      trig(d, T('dies', [S('oftNabbedDies')], { subj: 'self', label: 'its owner draws, others lose life' })),
  },
  'Village Pillagers': {
    'whenever a creature an opponent controls with a counter on it dies, you create a tapped treasure token': d =>
      trig(d, T('dies', [{ op: 'token', n: 1, tok: TREASURE, tapped: true }], { subj: 'any', f: { types: ['Creature'], ctrl: 'opp', anyCtr: true }, label: 'create a tapped Treasure' })),
  },
  "Puca's Covenant": {
    'whenever a creature you control with a counter on it dies, you may return another target permanent card with mana value less than or equal to the number of counters on that creature from your graveyard to your hand. do this only once each turn': d =>
      trig(d, T('dies', [S('pucaCovenant')], { subj: 'any', f: { types: ['Creature'], ctrl: 'you', anyCtr: true }, once: true, label: 'you may return a permanent card to your hand' })),
  },
  'Ferrafor, Young Yew': {
    'when ~ enters, create a number of 1/1 green saproling creature tokens equal to the number of counters among creatures target player controls': d =>
      trig(d, T('etb', [S('ferrafor')], { subj: 'self', label: 'create Saprolings', tslots: [{ who: 'player' }] })),
  },
  'Tree of Perdition': {
    "{t}: exchange target opponent's life total with ~'s toughness": d =>
      abil(d, { label: "Exchange toughness with an opponent's life", tap: true, tslots: [{ who: 'opp' }], effects: [S('treePerdition')] }),
  },
  'Massacre Girl, Known Killer': {
    'whenever a creature an opponent controls dies, if its toughness was less than 1, draw a card': d =>
      trig(d, T('dies', [S('massacreDraw')], { subj: 'any', f: { types: ['Creature'], ctrl: 'opp' }, label: 'draw a card' })),
  },
  'The Scorpion God': {
    "when ~ dies, return it to its owner's hand at the beginning of the next end step": d =>
      trig(d, T('dies', [S('scorpionReturn')], { subj: 'self', label: "return to its owner's hand at the next end step" })),
  },
  'Puppeteer Clique': {
    "when ~ enters, put target creature card from an opponent's graveyard onto the battlefield under your control. it gains haste. at the beginning of your next end step, exile it": d =>
      trig(d, T('etb', [S('puppeteer')], { subj: 'self', label: "steal from an opponent's graveyard", tslots: [GY_CREATURE_OPP] })),
  },
  'Dusk Urchins': {
    'when ~ dies, draw a card for each -1/-1 counter on it': d =>
      trig(d, T('dies', [S('duskUrchins')], { subj: 'self', label: 'draw for each -1/-1 counter' })),
  },
  "Black Sun's Zenith": {
    "put x -1/-1 counters on each creature. shuffle ~ into its owner's library": d =>
      spell(d, [{ op: 'addC', kind: '-1/-1', n: 'X', who: { all: { types: ['Creature'] } } }, S('shuffleSelf')]),
  },
  'Persist': {
    'return target nonlegendary creature card from your graveyard to the battlefield with a -1/-1 counter on it': d =>
      spell(d, [S('persistSpell')], [{ who: 'card', f: { types: ['Creature'] }, zoneOwner: 'you' }]),
  },
  'Archfiend of Ifnir': {
    'whenever you cycle or discard another card, put a -1/-1 counter on each creature your opponents control': d =>
      trig(d, T('discard', [{ op: 'addC', kind: '-1/-1', n: 1, who: { all: { types: ['Creature'], ctrl: 'opp' } } }], { pl: 'you', subj: 'other', f: { other: true }, label: 'put a -1/-1 counter on each opposing creature' })),
  },
  'Hapatra, Vizier of Poisons': {
    'whenever you put one or more -1/-1 counters on a creature, create a 1/1 green snake creature token with deathtouch': d =>
      trig(d, T('counterPut', [S('hapatraSnake')], { subj: 'any', f: { types: ['Creature'] }, kindF: '-1/-1', label: 'create a Snake' })),
  },
  'Glissa Sunslayer': {
    'whenever ~ deals combat damage to a player, choose one —\n• you draw a card and lose 1 life.\n• destroy target enchantment.\n• remove up to three counters from target permanent': d =>
      trig(d, T('combatDamagePlayer', [], { subj: 'self', label: 'choose one', modes: { min: 1, max: 1, list: [
        { label: 'Draw a card and lose 1 life', effects: [{ op: 'draw', n: 1 }, { op: 'lose', n: 1, pl: 'you' }] },
        { label: 'Destroy target enchantment', tslots: [{ who: 'perm', f: { types: ['Enchantment'] }, harm: true }], effects: [{ op: 'destroy', who: 't0' }] },
        { label: 'Remove up to three counters from target permanent', tslots: [{ who: 'perm' }], effects: [S('glissaRemC')] },
      ] } })),
  },
  'Burning Curiosity': {
    "exile the top two cards of your library. if ~'s additional cost was paid, exile the top three cards instead. until the end of your next turn, you may play those cards": d =>
      spell(d, [S('burningCuriosity')]),
  },
  "Hoarder's Greed": {
    'you lose 2 life and draw two cards, then clash with an opponent. if you win, repeat this process': d =>
      spell(d, [S('hoardersGreed')]),
  },
  'Blowfly Infestation': {
    'whenever a creature dies, if it had a -1/-1 counter on it, put a -1/-1 counter on target creature': d =>
      trig(d, T('dies', [{ op: 'addC', kind: '-1/-1', n: 1, who: 't0' }], { subj: 'any', f: { types: ['Creature'], ctr: '-1/-1' }, label: 'put a -1/-1 counter on target creature', tslots: [CREATURE] })),
  },
  'Fire Covenant': {
    '~ deals x damage divided as you choose among any number of target creatures': d =>
      spell(d, [S('divideDmg', { n: 'X' })], Array.from({ length: 8 }, (_, i) => ({ who: 'perm' as const, f: { types: ['Creature'] }, opt: true, harm: true, grp: 1, xIdx: i, xAmt: 'X' as const }))),
  },
  'Incremental Blight': {
    'put a -1/-1 counter on target creature, two -1/-1 counters on another target creature, and three -1/-1 counters on a third target creature': d =>
      spell(d, [
        { op: 'addC', kind: '-1/-1', n: 1, who: 't0' },
        { op: 'addC', kind: '-1/-1', n: 2, who: 't1' },
        { op: 'addC', kind: '-1/-1', n: 3, who: 't2' },
      ], [
        { who: 'perm', f: { types: ['Creature'] }, harm: true, grp: 1 },
        { who: 'perm', f: { types: ['Creature'] }, harm: true, grp: 1 },
        { who: 'perm', f: { types: ['Creature'] }, harm: true, grp: 1 },
      ]),
  },
};
