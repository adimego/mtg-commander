/** Exact Oracle patches for remaining Secrets of Strixhaven Commander leftovers. */
import type { CardDef, Effect, TriggerDef, TSlot, TokenSpec, Filter, ActAbility, Static, Modes } from './types';

type Patch = (d: CardDef) => void;
const S = (kind: string, extra: Partial<Effect> = {}): Effect => ({ op: 'script', kind, ...extra });
const T = (ev: string, effects: Effect[], extra: Partial<TriggerDef> = {}): TriggerDef => ({ on: 'x', ev, label: extra.label ?? 'trigger', effects, ...extra });
const trig = (d: CardDef, ...ts: TriggerDef[]) => { (d.triggers ??= []).push(...ts); };
const spell = (d: CardDef, effects: Effect[], tslots?: TSlot[]) => { const sp = (d.spell ??= { effects: [] }); sp.effects.push(...effects); if (tslots) sp.tslots = [...(sp.tslots ?? []), ...tslots]; };
const abil = (d: CardDef, a: ActAbility) => { (d.abilities ??= []).push(a); };
const st = (d: CardDef, ...ss: Static[]) => { (d.statics ??= []).push(...ss); };
const YOUR_CREATURES: Filter = { types: ['Creature'], ctrl: 'you' };

export const INKLING: TokenSpec = { name: 'Inkling', p: 2, t: 1, colors: ['W', 'B'], types: ['Creature'], sub: ['Inkling'], kws: ['flying'] };
const CAT: TokenSpec = { name: 'Cat', p: 2, t: 2, colors: ['W'], types: ['Creature'], sub: ['Cat'] };
const PEST: TokenSpec = { name: 'Pest', p: 1, t: 1, colors: ['B', 'G'], types: ['Creature'], sub: ['Pest'], ext: { text: 'When this creature dies, you gain 1 life.', triggers: [{ on: 'x', ev: 'dies', subj: 'self', label: 'gain 1 life', effects: [{ op: 'gain', n: 1, pl: 'you' }] }] } };
const SPAWN: TokenSpec = { name: 'Eldrazi Spawn', p: 0, t: 1, colors: [], types: ['Creature'], sub: ['Eldrazi', 'Spawn'], ext: { text: 'Sacrifice this creature: Add {C}.', mana: [{ add: ['C'], sac: true }] } };
const ELEMENTAL: TokenSpec = { name: 'Elemental', p: 3, t: 3, colors: ['U', 'R'], types: ['Creature'], sub: ['Elemental'], kws: ['flying'] };
const ELEM11: TokenSpec = { name: 'Elemental', p: 1, t: 1, colors: ['U', 'R'], types: ['Creature'], sub: ['Elemental'] };
const FRACTAL: TokenSpec = { name: 'Fractal', p: 0, t: 0, colors: ['G', 'U'], types: ['Creature'], sub: ['Fractal'] };
const SPIRIT_RW: TokenSpec = { name: 'Spirit', p: 3, t: 2, colors: ['R', 'W'], types: ['Creature'], sub: ['Spirit'] };
const BOAR: TokenSpec = { name: 'Boar', p: 2, t: 2, colors: ['G'], types: ['Creature'], sub: ['Boar'] };
const MYR: TokenSpec = { name: 'Phyrexian Myr', p: 2, t: 1, colors: ['U'], types: ['Artifact', 'Creature'], sub: ['Phyrexian', 'Myr'] };
const ZOMBIE: TokenSpec = { name: 'Zombie', p: 2, t: 2, colors: ['B'], types: ['Creature'], sub: ['Zombie'], kws: ['decayed'] };
const FOOD: TokenSpec = { name: 'Food', colors: [], types: ['Artifact'], preset: 'Food' };
const TREASURE: TokenSpec = { name: 'Treasure', colors: [], types: ['Artifact'], preset: 'Treasure' };

export const SOC_LEFTOVERS: Record<string, Record<string, Patch>> = {
  'Forum Filibuster': {
    'at the beginning of your upkeep, create a 2/1 white and black inkling creature token with flying. when you do, return up to one target aura or equipment card from your graveyard to the battlefield attached to that token': d =>
      trig(d, T('upkeep', [{ op: 'token', n: 1, tok: INKLING }, S('forumAttach')], { pl: 'you', label: 'create an Inkling', tslots: [{ who: 'card', zoneOwner: 'you', opt: true, f: { anyType: ['Aura', 'Equipment'] } }] })),
  },
  'Herald of Amity': {
    "when ~ enters, exile the top eight cards of your library. you may cast an aura spell from among them without paying its mana cost. then put the rest on the bottom of your library in a random order": d =>
      trig(d, T('etb', [S('heraldAmity')], { subj: 'self', label: 'exile 8, maybe cast an Aura' })),
  },
  'Eldrazi Conscription': {
    'enchanted creature gets +10/+10 and has trample and annihilator 2': d => st(d,
      { k: 'pt', who: 'attached', p: 10, t: 10 },
      { k: 'kw', who: 'attached', kws: ['trample'] },
      { k: 'grantAbil', who: 'attached', grant: { triggers: [T('combatDamagePlayer', [S('annihilator', { n: 2 })], { subj: 'self', label: 'Annihilator 2' })] } },
    ),
  },
  "Ajani's Chosen": {
    'whenever an enchantment you control enters, create a 2/2 white cat creature token. if that enchantment is an aura, you may attach it to the token': d =>
      trig(d, T('etb', [{ op: 'token', n: 1, tok: CAT }, S('ajaniAttach')], { subj: 'any', f: { types: ['Enchantment'], ctrl: 'you' }, label: 'create a Cat' })),
  },
  'Armored Skyhunter': {
    'whenever ~ attacks, look at the top six cards of your library. you may put an aura or equipment card from among them onto the battlefield. if an equipment is put onto the battlefield this way, you may attach it to a creature you control. put the rest of those cards on the bottom of your library in a random order': d =>
      trig(d, T('attacks', [S('skyhunter')], { subj: 'self', label: 'look at the top six' })),
  },
  'Combat Calligrapher': {
    "inklings can't attack you or planeswalkers you control": d => st(d, { k: 'cantAtkYou', who: 'all', f: { anyType: ['Inkling'] } }),
    'whenever a player attacks one of your opponents, that attacking player creates a tapped 2/1 white and black inkling creature token with flying that\'s attacking that opponent': d =>
      trig(d, T('attackPlayer', [S('calligrapherInk')], { pl: 'any', ifc: { k: 'evVsOpp' }, label: 'create an attacking Inkling' })),
  },
  'Eidolon of Countless Battles': {
    '~ and enchanted creature each get +1/+1 for each creature you control and +1/+1 for each aura you control': d => {
      const per = { plus: 0, of: { count: { types: ['Creature'], ctrl: 'you' } } };
      // p/t = creatures + auras you control
      st(d,
        { k: 'pt', who: 'self', p: { plus: 0, of: { count: { types: ['Creature'], ctrl: 'you' } } }, t: { plus: 0, of: { count: { types: ['Creature'], ctrl: 'you' } } } },
        { k: 'pt', who: 'self', p: { plus: 0, of: { count: { anyType: ['Aura'], ctrl: 'you' } } }, t: { plus: 0, of: { count: { anyType: ['Aura'], ctrl: 'you' } } } },
        { k: 'pt', who: 'attached', p: { plus: 0, of: { count: { types: ['Creature'], ctrl: 'you' } } }, t: { plus: 0, of: { count: { types: ['Creature'], ctrl: 'you' } } } },
        { k: 'pt', who: 'attached', p: { plus: 0, of: { count: { anyType: ['Aura'], ctrl: 'you' } } }, t: { plus: 0, of: { count: { anyType: ['Aura'], ctrl: 'you' } } } },
      );
    },
  },
  'Firemane Commando': {
    'whenever another player attacks with two or more creatures, they draw a card if none of those creatures attacked you': d =>
      trig(d, T('youAttack', [S('firemaneDraw')], { pl: 'notyou', ifc: { k: 'evAmtGE', n: 2 }, label: 'they draw if they didn\'t attack you' })),
  },
  'Mangara, the Diplomat': {
    'whenever an opponent attacks with creatures, if two or more of those creatures are attacking you and/or planeswalkers you control, draw a card': d =>
      trig(d, T('attackPlayer', [{ op: 'draw', n: 1, pl: 'you' }], { pl: 'opp', ifc: { k: 'evVsYou' }, label: 'draw a card' })),
    // amount>=2: ev.amount is creatures attacking that player. evVsYou + need amount>=2.
  },
  'Nils, Discipline Enforcer': {
    'at the beginning of your end step, for each player, put a +1/+1 counter on up to one target creature that player controls': d =>
      trig(d, T('endStep', [S('nilsCounters')], { pl: 'you', label: 'put +1/+1 counters' })),
    "each creature with one or more counters on it can't attack you or planeswalkers you control unless its controller pays {x}, where x is the number of counters on that creature": d =>
      st(d, { k: 'taxAtkCtr', who: 'self' }),
  },
  'Pearl-Ear, Imperial Advisor': {
    'whenever you cast an aura spell that targets a modified permanent you control, draw a card': d =>
      trig(d, T('cast', [S('pearlEar')], { pl: 'you', f: { anyType: ['Aura'] }, label: 'draw a card' })),
  },
  "Songbirds' Blessing": {
    'whenever enchanted creature attacks, reveal cards from the top of your library until you reveal an aura card. you may put that card onto the battlefield. if you don\'t, put it into your hand. put the rest on the bottom of your library in a random order': d =>
      trig(d, T('attacks', [S('songbirds')], { subj: 'attached', label: 'reveal until an Aura' })),
  },
  'Sram, Senior Edificer': {
    'whenever you cast an aura, equipment, or vehicle spell, draw a card': d =>
      trig(d, T('cast', [{ op: 'draw', n: 1, pl: 'you' }], { pl: 'you', f: { anyType: ['Aura', 'Equipment', 'Vehicle'] }, label: 'draw a card' })),
  },
  'Winds of Rath': {
    "destroy all creatures that aren't enchanted. they can't be regenerated": d => spell(d, [S('windsRath')]),
  },
  'Ghoulish Impetus': {
    'when enchanted creature dies, return ~ to the battlefield at the beginning of the next end step': d =>
      trig(d, T('dies', [{ op: 'delayRet', who: 'self', zone: 'graveyard' }], { subj: 'attached', label: 'return Impetus at end of turn' })),
  },
  'Keen Duelist': {
    'at the beginning of your upkeep, you and target opponent each reveal the top card of your library. you each lose life equal to the mana value of the card revealed by the other player. you each put the card you revealed into your hand': d =>
      trig(d, T('upkeep', [S('keenDuelist')], { pl: 'you', label: 'reveal and lose life', tslots: [{ who: 'opp' }] })),
  },
  'Breena, the Demagogue': {
    'whenever a player attacks one of your opponents, if that opponent has more life than another of your opponents, that attacking player draws a card and you put two +1/+1 counters on a creature you control': d =>
      trig(d, T('attackPlayer', [S('breena')], { pl: 'any', ifc: { k: 'evVsOpp' }, label: 'draw and counters' })),
  },
  'Eriette of the Charmed Apple': {
    "each creature that's enchanted by an aura you control can't attack you or planeswalkers you control": d =>
      st(d, { k: 'cantAtkYou', who: 'all', f: { types: ['Creature'] }, eriette: true }),
  },
  'Inkshield': {
    'prevent all combat damage that would be dealt to you this turn. for each 1 damage prevented this way, create a 2/1 white and black inkling creature token with flying': d => spell(d, [S('inkshield')]),
  },
  'Shadrix Silverquill': {
    'at the beginning of combat on your turn, you may choose two. each mode must target a different player.\n• target player creates a 2/1 white and black inkling creature token with flying.\n• target player draws a card and loses 1 life.\n• target player puts a +1/+1 counter on each creature they control': d =>
      trig(d, T('beginCombat', [S('shadrix')], { pl: 'you', label: 'choose two' })),
  },
  'Tomik, Wielder of Law': {
    'whenever an opponent attacks with creatures, if two or more of those creatures are attacking you and/or planeswalkers you control, that opponent loses 3 life and you draw a card': d =>
      trig(d, T('attackPlayer', [{ op: 'lose', n: 3, pl: 'evp' }, { op: 'draw', n: 1, pl: 'you' }], { pl: 'opp', ifc: { k: 'evVsYou' }, label: 'lose 3, draw' })),
  },
  'War Room': {
    "{3}, {t}, pay life equal to the number of colors in your commanders' color identity: draw a card": d =>
      abil(d, { label: 'Pay life equal to commander colors: draw', mana: { generic: 3 }, tap: true, effects: [S('warRoom')] }),
  },
  'Flickering Ward': {
    "enchanted creature has protection from the chosen color. this effect doesn't remove ~": d => st(d, { k: 'kw', who: 'attached', kws: ['protection from chosen'] } as Static),
  },
  'Fallen Ideal': {
    'enchanted creature has flying and "sacrifice a creature: ~ gets +2/+1 until end of turn."': d => st(d,
      { k: 'kw', who: 'attached', kws: ['flying'] },
      { k: 'grantAbil', who: 'attached', grant: { abilities: [{ label: 'Sacrifice a creature: +2/+1', sacF: { f: { types: ['Creature'] }, n: 1 }, effects: [{ op: 'pump', n: 2, m: 1, who: 'self' }] }] } },
    ),
  },
  'Darksteel Mutation': {
    'enchanted creature is an insect artifact creature with base power and toughness 0/1 and has indestructible, and it loses all other abilities, card types, and creature types': d => st(d,
      { k: 'darksteel', who: 'attached' }
    ),
  },
  'Ghostly Prison': {
    "creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you": d => st(d, { k: 'propaganda', who: 'self' }),
  },
  'Martial Impetus': {
    "whenever enchanted creature attacks, each other creature that's attacking one of your opponents gets +1/+1 until end of turn": d =>
      trig(d, T('attacks', [S('martialImpetus')], { subj: 'attached', label: '+1/+1 to other attackers of opponents' })),
  },
  "Raffine's Guidance": {
    'you may cast ~ from your graveyard by paying {2}{w} rather than paying its mana cost': d => { d.flashback = { generic: 2, W: 1 }; },
  },
  "Sage's Reverie": {
    "when ~ enters, draw a card for each aura you control that's attached to a creature": d =>
      trig(d, T('etb', [{ op: 'draw', n: { aurasOnYours: true }, pl: 'you' }], { subj: 'self', label: 'draw for each Aura' })),
    "enchanted creature gets +1/+1 for each aura you control that's attached to a creature": d =>
      st(d, { k: 'pt', who: 'attached', p: { aurasOnYours: true }, t: { aurasOnYours: true } }),
  },
  'Spirit Mantle': {
    'enchanted creature gets +1/+1 and has protection from creatures': d => st(d, { k: 'pt', who: 'attached', p: 1, t: 1 }, { k: 'kw', who: 'attached', kws: ['protection from creatures'] }),
  },
  'Animate Dead': {
    'enchant creature card in a graveyard': d => { d.aura = { who: 'card', zoneOwner: 'any', f: { types: ['Creature'] } }; },
    "when ~ enters, if it's on the battlefield, it loses \"enchant creature card in a graveyard\" and gains \"enchant creature put onto the battlefield with ~.\" return enchanted creature card to the battlefield under your control and attach ~ to it. when ~ leaves the battlefield, that creature's controller sacrifices it": d =>
      trig(d, T('etb', [S('animateDead')], { subj: 'self', label: 'return the enchanted card' }), T('ltb', [S('animateDeadLeave')], { subj: 'self', label: 'sacrifice the returned creature' })),
  },
  'Hateful Eidolon': {
    'whenever an enchanted creature dies, draw a card for each aura you controlled that was attached to it': d =>
      trig(d, T('dies', [S('hatefulEidolon')], { subj: 'any', f: { types: ['Creature'] }, label: 'draw for Auras' })),
  },
  'Killian, Ink Duelist': {
    'spells you cast that target a creature cost {2} less to cast': d => st(d, { k: 'costLess', who: 'all', n: 2, tgtCreature: true }),
  },
  'Arcane Lighthouse': {
    "{1}, {t}: until end of turn, creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud": d =>
      abil(d, { label: 'Opponents\' creatures lose hexproof and shroud', mana: { generic: 1 }, tap: true, effects: [S('arcaneLighthouse')] }),
  },
  'Study Hall': {
    "{1}, {t}: add one mana of any color. when you spend this mana to cast your commander, scry x, where x is the number of times it's been cast from the command zone this game": d => {
      (d.mana ??= []).push({ add: ['ANY'], tap: true, cost: { generic: 1 }, only: 'commander' });
      trig(d, T('cast', [S('studyHall')], { pl: 'you', f: { cmdr: 'own' }, label: 'scry X' }));
    },
  },
  'Abstract Performance': {
    'exile the top four cards of your library in a face-down pile, then exile the top four cards of your library in a face-up pile. an opponent chooses one of those piles. put that pile into your graveyard. look at the cards in the other pile. you may cast a spell from among them without paying its mana cost. put the rest into your hand': d =>
      spell(d, [S('abstractPerf')]),
  },
  'Leitmotif Composer': {
    '{2}{u}: creatures named ~ can\'t be blocked this turn': d =>
      abil(d, { label: 'Creatures named this can\'t be blocked this turn', mana: { generic: 2, U: 1 }, effects: [S('leitmotif')] }),
  },
  'Furygale Flocking': {
    '~ costs {1} less to cast for each instant and sorcery card in your graveyard': d => { d.selfCostLess = { n: 1, per: { cards: 'graveyard', pl: 'you', f: { anyType: ['Instant', 'Sorcery'] } } }; },
    'for each opponent, create two 3/3 blue and red elemental creature tokens with flying that attack that opponent this turn if able. they gain haste until end of turn': d =>
      spell(d, [S('furygale')]),
  },
  'Prismari Pianist': {
    "whenever you cast an instant or sorcery spell, create a 1/1 blue and red elemental creature token. if that spell's mana value is 5 or greater, create three of those tokens instead": d =>
      trig(d, T('cast', [S('pianist')], { pl: 'you', f: { types: ['Instant', 'Sorcery'] }, label: 'create Elementals' })),
  },
  'Renegade Bull': {
    'whenever ~ attacks, exile up to one target instant or sorcery card from your graveyard and copy it. you may cast the copy without paying its mana cost': d =>
      trig(d, T('attacks', [S('renegadeBull')], { subj: 'self', label: 'exile and copy', tslots: [{ who: 'card', zoneOwner: 'you', opt: true, f: { types: ['Instant', 'Sorcery'] } }] })),
  },
  'Determined Iteration': {
    'at the beginning of combat on your turn, populate. the token created this way gains haste. sacrifice it at the beginning of the next end step': d =>
      trig(d, T('beginCombat', [{ op: 'script', kind: 'populate' }, S('iterToken')], { pl: 'you', label: 'populate, haste, sac' })),
  },
  'Harmonic Prodigy': {
    'if a triggered ability of a shaman or another wizard you control triggers, that ability triggers an additional time': d => { d.trigTwice = 'shamanWizard'; },
  },
  'Rite of Replication': {
    "create a token that's a copy of target creature. if ~ was kicked, create five of those tokens instead": d =>
      spell(d, [S('riteRep')], [{ who: 'perm', f: { types: ['Creature'] } }]),
  },
  'Thunderclap Drake': {
    '{2}{u}, sacrifice ~: when you next cast an instant or sorcery spell this turn, copy it for each time you\'ve cast your commander from the command zone this game. you may choose new targets for the copies': d =>
      abil(d, { label: 'Next I/S is copied per commander casts', mana: { generic: 2, U: 1 }, sac: true, effects: [S('thunderclap')] }),
  },
  'Creative Technique': {
    'shuffle your library, then reveal cards from the top of it until you reveal a nonland card. exile that card and put the rest on the bottom of your library in a random order. you may cast the exiled card without paying its mana cost': d =>
      spell(d, [S('creativeTech')]),
  },
  'Dance with Calamity': {
    'shuffle your library. as many times as you choose, you may exile the top card of your library. if the total mana value of the cards exiled this way is 13 or less, you may cast any number of spells from among those cards without paying their mana costs': d =>
      spell(d, [S('danceCalamity')]),
  },
  'Goldspan Dragon': {
    'whenever ~ attacks or becomes the target of a spell, create a treasure token': d => {
      trig(d, T('attacks', [{ op: 'token', n: 1, tok: TREASURE }], { subj: 'self', label: 'Treasure' }));
      trig(d, T('targeted', [{ op: 'token', n: 1, tok: TREASURE }], { subj: 'self', label: 'Treasure' }));
    },
  },
  'Manaform Hellkite': {
    'whenever you cast a noncreature spell, create an x/x red dragon illusion creature token with flying and haste, where x is the amount of mana spent to cast that spell. exile that token at the beginning of the next end step': d =>
      trig(d, T('cast', [S('manaform')], { pl: 'you', f: { notTypes: ['Creature'] }, label: 'create a Dragon Illusion' })),
  },
  'Mirrorwing Dragon': {
    'whenever a player casts an instant or sorcery spell that targets only ~, that player copies that spell for each other creature they control that the spell could target. each copy targets a different one of those creatures': d =>
      trig(d, T('cast', [S('mirrorwing')], { pl: 'any', f: { types: ['Instant', 'Sorcery'] }, label: 'copy for each other creature' })),
  },
  'Plargg and Nassari': {
    'at the beginning of your upkeep, each player exiles cards from the top of their library until they exile a nonland card. an opponent chooses a nonland card exiled this way. you may cast up to two spells from among the other cards exiled this way without paying their mana costs': d =>
      trig(d, T('upkeep', [S('plargg')], { pl: 'you', label: 'exile until nonland' })),
  },
  'Rionya, Fire Dancer': {
    "at the beginning of combat on your turn, create x tokens that are copies of another target creature you control, where x is one plus the number of instant and sorcery spells you've cast this turn. they gain haste. exile them at the beginning of the next end step": d =>
      trig(d, T('beginCombat', [S('rionya')], { pl: 'you', label: 'copy a creature', tslots: [{ who: 'perm', f: { types: ['Creature'], ctrl: 'you', other: true } }] })),
  },
  'Rousing Refrain': {
    "add {r} for each card in target opponent's hand. until end of turn, you don't lose this mana as steps and phases end. exile ~ with three time counters on it": d =>
      spell(d, [S('rousingRefrain')], [{ who: 'opp' }]),
  },
  'Surge to Victory': {
    "exile target instant or sorcery card from your graveyard. creatures you control get +x/+0 until end of turn, where x is that card's mana value. whenever a creature you control deals combat damage to a player this turn, copy the exiled card. you may cast the copy without paying its mana cost": d =>
      spell(d, [S('surgeVictory')], [{ who: 'card', zoneOwner: 'you', f: { types: ['Instant', 'Sorcery'] } }]),
  },
  'Twinflame': {
    'strive — ~ costs {2}{r} more to cast for each target beyond the first': d => { d.strive = true; },
    'choose any number of target creatures you control. for each of them, create a token that\'s a copy of that creature, except it has haste. exile those tokens at the beginning of the next end step': d =>
      spell(d, [S('twinflame')], [{ who: 'perm', f: YOUR_CREATURES, opt: true }]),
  },
  'Brudiclad, Telchor Engineer': {
    'at the beginning of combat on your turn, create a 2/1 blue phyrexian myr artifact creature token. then you may choose a token you control. if you do, each other token you control becomes a copy of that token': d =>
      trig(d, T('beginCombat', [{ op: 'token', n: 1, tok: MYR }, S('brudiclad')], { pl: 'you', label: 'Myr, then copy a token' })),
  },
  'Galazeth Prismari': {
    'artifacts you control have "{t}: add one mana of any color. spend this mana only to cast an instant or sorcery spell."': d =>
      st(d, { k: 'grantMana', who: 'all', f: { types: ['Artifact'], ctrl: 'you' }, mana: [{ add: ['ANY'], tap: true, only: 'is' }] }),
  },
  'Magma Opus': {
    '~ deals 4 damage divided as you choose among any number of targets. tap two target permanents. create a 4/4 blue and red elemental creature token. draw two cards': d =>
      spell(d, [S('magmaOpus')], [{ who: 'any', opt: true }, { who: 'any', opt: true, distinct: true }, { who: 'any', opt: true, distinct: true }, { who: 'any', opt: true, distinct: true }, { who: 'perm' }, { who: 'perm', distinct: true }]),
    '{u/r}{u/r}, discard ~: create a treasure token': d =>
      abil(d, { label: 'Discard: Treasure', zone: 'hand', mana: { hyb: ['U|R', 'U|R'], generic: 0 }, discard: 1, effects: [{ op: 'token', n: 1, tok: TREASURE }] }),
  },
  'Veyran, Voice of Duality': {
    'if you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time': d => { d.trigTwice = 'veyran'; },
  },
  'Hall of Oracles': {
    "{t}: put a +1/+1 counter on target creature. activate only as a sorcery and only if you've cast an instant or sorcery spell this turn": d =>
      abil(d, { label: '+1/+1 counter', tap: true, sorcery: true, cond: { k: 'castNoncThisTurn' }, tslots: [{ who: 'perm', f: { types: ['Creature'] } }], effects: [{ op: 'addC', who: 't0', kind: '+1/+1', n: 1 }] }),
  },
  'Prismari Charm': {
    'choose one —\n• surveil 2, then draw a card.\n• ~ deals 1 damage to each of one or two targets.\n• return target nonland permanent to its owner\'s hand': d => {
      d.spell = { effects: [], modes: { min: 1, max: 1, list: [
        { label: 'Surveil 2, then draw', effects: [{ op: 'surveil', n: 2 }, { op: 'draw', n: 1, pl: 'you' }] },
        { label: '1 damage to one or two targets', tslots: [{ who: 'any', harm: true }, { who: 'any', harm: true, opt: true, distinct: true }], effects: [{ op: 'damage', n: 1, who: 't0' }, { op: 'damage', n: 1, who: 't1' }] },
        { label: 'Bounce a nonland', tslots: [{ who: 'perm', f: { notTypes: ['Land'] }, harm: true }], effects: [{ op: 'bounce', who: 't0' }] },
      ] } };
    },
  },
  'Aether Gale': {
    'return six target nonland permanents to their owners\' hands': d => spell(d, [
      { op: 'bounce', who: 't0' }, { op: 'bounce', who: 't1' }, { op: 'bounce', who: 't2' },
      { op: 'bounce', who: 't3' }, { op: 'bounce', who: 't4' }, { op: 'bounce', who: 't5' },
    ], Array.from({ length: 6 }, (_, i) => ({ who: 'perm' as const, f: { notTypes: ['Land'] }, harm: true, grp: 0, distinct: i > 0 }))),
  },
  'Volcanic Torrent': {
    "~ deals x damage to each creature and planeswalker your opponents control, where x is the number of spells you've cast this turn": d =>
      spell(d, [S('volcTorrent')]),
  },
  'Rootha, Mercurial Artist': {
    "{2}, return ~ to its owner's hand: copy target instant or sorcery spell you control. you may choose new targets for the copy": d =>
      abil(d, { label: 'Return to hand: copy an I/S you control', mana: { generic: 2 }, returnSelf: true, tslots: [{ who: 'spell', f: { types: ['Instant', 'Sorcery'], ctrl: 'you' } }], effects: [S('roothaCopy')] }),
  },
  'Merchant of Venom': {
    'whenever a player sacrifices a permanent, put a +1/+1 counter on ~': d =>
      trig(d, T('sacrificed', [{ op: 'addC', who: 'self', kind: '+1/+1', n: 1 }], { pl: 'any', label: '+1/+1 counter' })),
  },
  'Feral Appetite': {
    '{1}{g}: exile target card from a graveyard. if a creature card is exiled this way, create a 1/1 black and green pest creature token with "when ~ dies, you gain 1 life."': d =>
      abil(d, { label: 'Exile a card from a graveyard', mana: { generic: 1, G: 1 }, tslots: [{ who: 'card', zoneOwner: 'any' }], effects: [{ op: 'exile', who: 't0' }, S('feralPest')] }),
  },
  'Ribtruss Roaster': {
    'at the beginning of your end step, create a number of 1/1 black and green pest creature tokens equal to the number of +1/+1 counters on ~. they have "when ~ dies, you gain 1 life."': d =>
      trig(d, T('endStep', [S('ribtruss')], { pl: 'you', label: 'create Pests' })),
  },
  'Immoral Bargain': {
    'as an additional cost to cast ~, sacrifice x creatures': d => { d.extraCost = { sacX: true }; },
  },
  'Final Act': {
    'choose one or more —\n• destroy all creatures.\n• destroy all planeswalkers.\n• destroy all battles.\n• exile all graveyards.\n• each opponent loses all counters': d => {
      d.spell = { effects: [], modes: { min: 1, max: 5, list: [
        { label: 'Destroy all creatures', effects: [{ op: 'destroy', who: { all: { types: ['Creature'] } } }] },
        { label: 'Destroy all planeswalkers', effects: [{ op: 'destroy', who: { all: { types: ['Planeswalker'] } } }] },
        { label: 'Destroy all battles', effects: [{ op: 'destroy', who: { all: { anyType: ['Battle'] } } }] },
        { label: 'Exile all graveyards', effects: [{ op: 'exileGrave', pl: 'all' }] },
        { label: 'Each opponent loses all counters', effects: [S('finalActCounters')] },
      ] } };
    },
  },
  'Jadar, Ghoulcaller of Nephalia': {
    'at the beginning of your end step, if you control no creatures with decayed, create a 2/2 black zombie creature token with decayed': d =>
      trig(d, T('endStep', [S('jadar')], { pl: 'you', label: 'create a Zombie' })),
  },
  'Nether Traitor': {
    'whenever another creature is put into your graveyard from the battlefield, you may pay {b}. if you do, return ~ from your graveyard to the battlefield': d =>
      trig(d, T('dies', [S('netherTraitor')], { subj: 'other', f: { types: ['Creature'] }, pl: 'you', gy: true, label: 'pay {B}: return' })),
  },
  'Priest of Forgotten Gods': {
    '{t}, sacrifice two other creatures: any number of target players each lose 2 life and sacrifice a creature. you add {b}{b} and draw a card': d =>
      abil(d, { label: 'Opponents lose 2 and sac, you add BB and draw', tap: true, sacF: { f: { types: ['Creature'] }, n: 2, other: true }, effects: [S('priestFG')] }),
  },
  'Witch of the Moors': {
    'at the beginning of your end step, if you gained life this turn, each opponent sacrifices a creature and you return up to one target creature card from your graveyard to your hand': d =>
      trig(d, T('endStep', [{ op: 'sac', pl: 'opps', f: { types: ['Creature'] }, n: 1 }, { op: 'ret', who: 't0', dest: 'hand', zone: 'graveyard' }], { pl: 'you', ifc: { k: 'lifeGainedThisTurn', n: 1 }, label: 'sac and return', tslots: [{ who: 'card', zoneOwner: 'you', opt: true, f: { types: ['Creature'] } }] })),
  },
  'Awakening Zone': {
    'at the beginning of your upkeep, you may create a 0/1 colorless eldrazi spawn creature token. it has "sacrifice ~: add {c}."': d =>
      trig(d, T('upkeep', [{ op: 'may', text: 'create an Eldrazi Spawn?', sub: [{ op: 'token', n: 1, tok: SPAWN }] }], { pl: 'you', label: 'maybe Spawn' })),
  },
  'Blossoming Bogbeast': {
    'whenever ~ attacks, you gain 2 life. then creatures you control gain trample and get +x/+x until end of turn, where x is the amount of life you gained this turn': d =>
      trig(d, T('attacks', [{ op: 'gain', n: 2, pl: 'you' }, S('bogbeast')], { subj: 'self', label: 'gain 2, then pump' })),
  },
  'Pest Infestation': {
    'destroy up to x target artifacts and/or enchantments. create twice x 1/1 black and green pest creature tokens with "when ~ dies, you gain 1 life."': d =>
      spell(d, [S('pestInfest')], [{ who: 'perm', f: { anyType: ['Artifact', 'Enchantment'] }, opt: true, xIdx: 0 }, { who: 'perm', f: { anyType: ['Artifact', 'Enchantment'] }, opt: true, xIdx: 1, distinct: true }, { who: 'perm', f: { anyType: ['Artifact', 'Enchantment'] }, opt: true, xIdx: 2, distinct: true }, { who: 'perm', f: { anyType: ['Artifact', 'Enchantment'] }, opt: true, xIdx: 3, distinct: true }]),
  },
  'Culling Ritual': {
    'destroy each nonland permanent with mana value 2 or less. add {b} or {g} for each permanent destroyed this way': d =>
      spell(d, [S('cullingRitual')]),
  },
  'Gyome, Master Chef': {
    'at the beginning of your end step, create a number of food tokens equal to the number of nontoken creatures you had enter the battlefield under your control this turn': d =>
      trig(d, T('endStep', [S('gyome')], { pl: 'you', label: 'create Foods' })),
  },
  'Mazirek, Kraul Death Priest': {
    'whenever a player sacrifices another permanent, put a +1/+1 counter on each creature you control': d =>
      trig(d, T('sacrificed', [{ op: 'addC', who: { all: YOUR_CREATURES }, kind: '+1/+1', n: 1 }], { pl: 'any', subj: 'other', label: '+1/+1 counters' })),
  },
  'Witherbloom Command': {
    'choose two —\n• target player mills three cards, then you return a land card from your graveyard to your hand.\n• destroy target noncreature, nonland permanent with mana value 2 or less.\n• target creature gets -3/-1 until end of turn.\n• target opponent loses 2 life and you gain 2 life': d => {
      d.spell = { effects: [], modes: { min: 2, max: 2, list: [
        { label: 'Mill 3, return a land', tslots: [{ who: 'player' }], effects: [{ op: 'mill', n: 3, pl: 't0' }, S('witherLand')] },
        { label: 'Destroy a cheap noncreature nonland', tslots: [{ who: 'perm', f: { notTypes: ['Creature', 'Land'], mvLE: 2 }, harm: true }], effects: [{ op: 'destroy', who: 't0' }] },
        { label: 'Creature gets -3/-1', tslots: [{ who: 'perm', f: { types: ['Creature'] }, harm: true }], effects: [{ op: 'pump', n: -3, m: -1, who: 't0' }] },
        { label: 'Opp loses 2, you gain 2', tslots: [{ who: 'opp' }], effects: [{ op: 'lose', n: 2, pl: 't0' }, { op: 'gain', n: 2, pl: 'you' }] },
      ] } };
    },
  },
  'Pawn of Ulamog': {
    'whenever ~ or another nontoken creature you control dies, you may create a 0/1 colorless eldrazi spawn creature token. it has "sacrifice ~: add {c}."': d =>
      trig(d, T('dies', [{ op: 'may', text: 'create an Eldrazi Spawn?', sub: [{ op: 'token', n: 1, tok: SPAWN }] }], { subj: 'any', f: { types: ['Creature'], ctrl: 'you', nontoken: true }, label: 'maybe Spawn' })),
  },
  'Plumb the Forbidden': {
    'as an additional cost to cast ~, you may sacrifice one or more creatures. when you do, copy ~ for each creature sacrificed this way': d => { d.extraCost = { sacX: true }; spell(d, [S('plumbForbidden')]); },
  },
  'Deadly Brew': {
    'each player sacrifices a creature or planeswalker. if you sacrificed a permanent this way, you may return another permanent card from your graveyard to your hand': d =>
      spell(d, [S('deadlyBrew')]),
  },
  'Haywire Mite': {
    '{g}, sacrifice ~: exile target noncreature artifact or noncreature enchantment': d =>
      abil(d, { label: 'Exile a noncreature artifact or enchantment', mana: { G: 1, generic: 0 }, sac: true, tslots: [{ who: 'perm', f: { anyType: ['Artifact', 'Enchantment'], notTypes: ['Creature'] }, harm: true }], effects: [{ op: 'exile', who: 't0' }] }),
  },
  'Augusta, Order Returned': {
    'whenever ~ attacks, each player exiles a card from their graveyard. when one or more nonland cards are exiled this way, put that many +1/+1 counters on target attacking creature': d =>
      trig(d, T('attacks', [S('augusta')], { subj: 'self', label: 'exile from graveyards', tslots: [{ who: 'perm', f: { types: ['Creature'], attacking: true } }] })),
  },
  'Ceaseless Conflict': {
    'destroy all creatures. then create a 3/2 red and white spirit creature token for each nontoken creature you controlled that was destroyed this way': d =>
      spell(d, [S('ceaseless')]),
  },
  'Vanguard of the Restless': {
    "spirits you control get +1/+1 for each time you've cast your commander from the command zone this game": d =>
      st(d, { k: 'pt', who: 'all', f: { anyType: ['Spirit'], ctrl: 'you' }, p: { cmdCasts: true }, t: { cmdCasts: true } }),
  },
  'Fateful Tempest': {
    "council's dilemma — starting with you, each player votes for past or present. you mill a card for each past vote, then ~ deals damage to each opponent equal to the total mana value of cards milled this way. exile the top card of your library for each present vote. until the end of your next turn, you may play the exiled cards": d =>
      spell(d, [S('fatefulTempest')]),
  },
  'Spirit of Resilience': {
    'whenever one or more cards leave your graveyard, put a +1/+1 counter on ~, then you may have ~ become a copy of an artifact or creature card from among those cards until end of turn': d =>
      trig(d, T('leaveGy', [S('spiritResilience')], { pl: 'you', batch: true, label: '+1/+1, maybe copy' })),
  },
  'Moonshaker Cavalry': {
    'when ~ enters, creatures you control gain flying and get +x/+x until end of turn, where x is the number of creatures you control': d =>
      trig(d, T('etb', [{ op: 'grant', who: { all: YOUR_CREATURES }, kw: ['flying'] }, { op: 'pump', who: { all: YOUR_CREATURES }, n: { count: YOUR_CREATURES }, m: { count: YOUR_CREATURES } }], { subj: 'self', label: 'flying and +X/+X' })),
  },
  'Wave of Reckoning': {
    'each creature deals damage to itself equal to its power': d => spell(d, [S('waveReckon')]),
  },
  'Ao, the Dawn Sky': {
    'when ao dies, choose one —\n• look at the top seven cards of your library. put any number of nonland permanent cards with total mana value 4 or less from among them onto the battlefield. put the rest on the bottom of your library in a random order.\n• put two +1/+1 counters on each permanent you control that\'s a creature or vehicle': d => {
      trig(d, T('dies', [], { subj: 'self', label: 'choose one', modes: { min: 1, max: 1, list: [
        { label: 'Look at the top seven', effects: [S('aoLook')] },
        { label: '+1/+1 counters on creatures and Vehicles', effects: [S('aoCounters')] },
      ] } }));
    },
  },
  "Archaeomancer's Map": {
    'whenever a land an opponent controls enters, if that player controls more lands than you, you may put a land card from your hand onto the battlefield': d =>
      trig(d, T('etb', [S('archMap')], { subj: 'any', f: { types: ['Land'], ctrl: 'opp' }, label: 'maybe put a land' })),
  },
  'Claim Jumper': {
    'when ~ enters, if an opponent controls more lands than you, you may search your library for a plains card and put it onto the battlefield tapped. then if an opponent controls more lands than you, repeat this process once. if you search your library this way, shuffle': d =>
      trig(d, T('etb', [S('claimJumper')], { subj: 'self', ifc: { k: 'oppControlsMore', f: { types: ['Land'] } }, label: 'search for Plains' })),
  },
  'Drumbellower': {
    "untap all creatures you control during each other player's untap step": d => st(d, { k: 'oppUntapCreatures', who: 'self' }),
  },
  'Guardian of Faith': {
    'when ~ enters, any number of other target creatures you control phase out': d =>
      trig(d, T('etb', [S('guardianPhase')], { subj: 'self', label: 'phase out creatures' })),
  },
  'Serra Paragon': {
    'once during each of your turns, you may play a land from your graveyard or cast a permanent spell with mana value 3 or less from your graveyard. if you do, it gains "when ~ is put into a graveyard from the battlefield, exile it and you gain 2 life."': d => { (d as CardDef).text = (d.text ?? '') + ''; (d as CardDef & { serraGy?: boolean }).serraGy = true; },
  },
  "Sevinne's Reclamation": {
    'return target permanent card with mana value 3 or less from your graveyard to the battlefield. if ~ was cast from a graveyard, you may copy ~ and may choose a new target for the copy': d =>
      spell(d, [{ op: 'ret', who: 't0', dest: 'battlefield', zone: 'graveyard' }, S('sevinneCopy')], [{ who: 'card', zoneOwner: 'you', f: { mvLE: 3 } }]),
  },
  'Skyclave Apparition': {
    'when ~ enters, exile up to one target nonland, nontoken permanent you don\'t control with mana value 4 or less': d =>
      trig(d, T('etb', [{ op: 'exile', who: 't0' }, S('skyclaveLink')], { subj: 'self', label: 'exile a permanent', tslots: [{ who: 'perm', opt: true, f: { notTypes: ['Land'], nontoken: true, ctrl: 'opp', mvLE: 4 }, harm: true }] })),
    "when ~ leaves the battlefield, the exiled card's owner creates an x/x blue illusion creature token, where x is the mana value of the exiled card": d =>
      trig(d, T('ltb', [S('skyclaveLeave')], { subj: 'self', label: 'create an Illusion' })),
  },
  'Conspiracy Theorist': {
    'whenever ~ attacks, you may pay {1} and discard a card. if you do, draw a card': d =>
      trig(d, T('attacks', [S('conspiracyAtk')], { subj: 'self', label: 'pay {1} and discard, draw' })),
    'whenever you discard one or more nonland cards, you may exile one of them from your graveyard. if you do, you may cast it this turn': d =>
      trig(d, T('discard', [S('conspiracyDisc')], { pl: 'you', batch: true, label: 'exile and maybe cast' })),
  },
  'Laelia, the Blade Reforged': {
    'whenever one or more cards are put into exile from your library and/or your graveyard, put a +1/+1 counter on ~': d =>
      trig(d, T('leaveGy', [{ op: 'addC', who: 'self', kind: '+1/+1', n: 1 }], { pl: 'you', batch: true, label: '+1/+1' })),
  },
  'Hofri Ghostforge': {
    'whenever another nontoken creature you control dies, exile it. if you do, create a token that\'s a copy of that creature, except it\'s a spirit in addition to its other types and it has "when ~ leaves the battlefield, return the exiled card to its owner\'s graveyard."': d =>
      trig(d, T('dies', [S('hofri')], { subj: 'other', f: { types: ['Creature'], ctrl: 'you', nontoken: true }, label: 'exile and make a Spirit' })),
  },
  'Quintorius, Loremaster': {
    '{1}{r}{w}, {t}, sacrifice a spirit: choose target card exiled with ~. you may cast that card this turn without paying its mana cost. if that spell would be put into a graveyard, put it on the bottom of its owner\'s library instead': d =>
      abil(d, { label: 'Cast a card exiled with Quintorius', mana: { generic: 1, R: 1, W: 1 }, tap: true, sacF: { f: { anyType: ['Spirit'] }, n: 1 }, effects: [S('quintoCast')] }),
  },
  'Venerable Warsinger': {
    'whenever ~ deals combat damage to a player, you may return target creature card with mana value x or less from your graveyard to the battlefield, where x is the amount of damage ~ dealt to that player': d =>
      trig(d, T('combatDamagePlayer', [S('warsinger')], { subj: 'self', label: 'return a creature', tslots: [{ who: 'card', zoneOwner: 'you', opt: true, f: { types: ['Creature'] } }] })),
  },
  'Anger': {
    'as long as ~ is in your graveyard and you control a mountain, creatures you control have haste': d => { d.gyHaste = true; },
  },
  'Millikin': {
    '{t}, mill a card: add {c}': d => abil(d, { label: '{T}, mill a card: add {C}', tap: true, manaAb: true, effects: [{ op: 'mill', n: 1, pl: 'you' }, { op: 'addMana', mana: ['C'] }] }),
  },
  'Perpetual Timepiece': {
    '{2}, exile ~: shuffle any number of target cards from your graveyard into your library': d =>
      abil(d, { label: 'Shuffle any number of cards from your graveyard', mana: { generic: 2 }, exileSelf: true, effects: [S('timepiece')] }),
  },
  'Owlin Spiralmancer': {
    'whenever you cast your first spell with {x} in its mana cost each turn, you may copy it. you may choose new targets for the copy': d =>
      trig(d, T('cast', [S('owlinCopy')], { pl: 'you', f: { hasX: true }, nth: { k: 'x', n: 1 }, label: 'maybe copy' })),
  },
  'Nexus Mentality': {
    'choose one. if you control a commander as you cast ~, you may choose both instead.\n• move all counters from target nonland permanent you control onto another target nonland permanent you control.\n• remove all counters from target nonland permanent you control. draw a card for each counter removed this way': d => {
      d.spell = { effects: [], modes: { min: 1, max: 1, bothIf: { k: 'ctlCommander' }, list: [
        { label: 'Move all counters', tslots: [{ who: 'perm', f: { notTypes: ['Land'], ctrl: 'you' } }, { who: 'perm', f: { notTypes: ['Land'], ctrl: 'you' }, distinct: true }], effects: [S('nexusMove')] },
        { label: 'Remove all counters, draw that many', tslots: [{ who: 'perm', f: { notTypes: ['Land'], ctrl: 'you' } }], effects: [S('nexusDraw')] },
      ] } };
    },
  },
  'Kinetic Ooze': {
    'when ~ enters, destroy up to one target artifact or enchantment with mana value x or less. if x is 5 or more, you draw a card. if x is 10 or more, double the number of +1/+1 counters on any number of other target creatures': d =>
      trig(d, T('etb', [S('kineticOoze')], { subj: 'self', label: 'destroy, maybe draw and double', tslots: [{ who: 'perm', f: { anyType: ['Artifact', 'Enchantment'] }, opt: true, harm: true }] })),
  },
  'Lattice Library': {
    'when ~ enters and whenever you cast your first spell with {x} in its mana cost each turn, create a 0/0 green and blue fractal creature token. put a number of +1/+1 counters on it equal to the number of study counters on ~': d => {
      const fx: Effect[] = [S('latticeFrac')];
      trig(d, T('etb', fx, { subj: 'self', label: 'create a Fractal' }), T('cast', fx, { pl: 'you', f: { hasX: true }, nth: { k: 'x', n: 1 }, label: 'create a Fractal' }));
    },
  },
  'Nev, the Practical Dean': {
    'whenever you cast your first spell with {x} in its mana cost each turn, put x +1/+1 counters on nev': d =>
      trig(d, T('cast', [S('nevX')], { pl: 'you', f: { hasX: true }, nth: { k: 'x', n: 1 }, label: 'put X +1/+1 counters' })),
  },
  'Brass Infiniscope': {
    '{t}: add {c}{c}. when you next cast a spell with {x} in its mana cost this turn, you draw a card and gain half x life, rounded down': d =>
      abil(d, { label: 'Add {C}{C}, then next {X} spell', tap: true, manaAb: true, effects: [{ op: 'addMana', mana: ['C', 'C'] }, S('brassNext')] }),
  },
  "Commander's Insight": {
    "target player draws x cards plus an additional card for each time they've cast a commander from the command zone this game": d =>
      spell(d, [S('cmdInsight')], [{ who: 'player' }]),
  },
  'Ingenious Prodigy': {
    'at the beginning of your upkeep, if ~ has one or more +1/+1 counters on it, you may remove a +1/+1 counter from it. if you do, draw a card': d =>
      trig(d, T('upkeep', [S('ingenious')], { pl: 'you', ifc: { k: 'ctrGE', kind: '+1/+1', n: 1 }, label: 'maybe remove a counter, draw' })),
  },
  'Unbound Flourishing': {
    'whenever you cast a permanent spell with a mana cost that contains {x}, double the value of x': d =>
      trig(d, T('cast', [S('unboundDbl')], { pl: 'you', f: { hasX: true }, label: 'double X' })),
    "whenever you cast an instant or sorcery spell or activate an ability, if that spell's mana cost or that ability's activation cost contains {x}, copy that spell or ability. you may choose new targets for the copy": d =>
      trig(d, T('cast', [S('unboundCopy')], { pl: 'you', f: { types: ['Instant', 'Sorcery'], hasX: true }, label: 'copy' })),
  },
  'Curse of the Swine': {
    'exile x target creatures. for each creature exiled this way, its controller creates a 2/2 green boar creature token': d =>
      spell(d, [S('curseSwine')], [{ who: 'perm', f: { types: ['Creature'] }, harm: true, xIdx: 0 }, { who: 'perm', f: { types: ['Creature'] }, harm: true, xIdx: 1, distinct: true }, { who: 'perm', f: { types: ['Creature'] }, harm: true, xIdx: 2, distinct: true }, { who: 'perm', f: { types: ['Creature'] }, harm: true, xIdx: 3, distinct: true }]),
  },
  "Zimone's Hypothesis": {
    'you may put a +1/+1 counter on a creature. then choose odd or even. return each creature with power of the chosen quality to its owner\'s hand': d =>
      spell(d, [S('zimoneHyp')]),
  },
  "Animist's Awakening": {
    'reveal the top x cards of your library. put all land cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order': d =>
      spell(d, [S('animistAwake')]),
    'spell mastery — if there are two or more instant and/or sorcery cards in your graveyard, untap those lands': d =>
      spell(d, [S('animistMastery')]),
  },
  'Forgotten Ancient': {
    'at the beginning of your upkeep, you may move any number of +1/+1 counters from ~ onto other creatures': d =>
      trig(d, T('upkeep', [S('forgottenAnc')], { pl: 'you', label: 'move counters' })),
  },
  'Fractal Harness': {
    'whenever equipped creature attacks, double the number of +1/+1 counters on it': d =>
      trig(d, T('attacks', [S('doubleP1', { who: 'attached' })], { subj: 'attached', label: 'double +1/+1 counters' })),
  },
  'Goldvein Hydra': {
    'when ~ dies, create a number of tapped treasure tokens equal to its power': d =>
      trig(d, T('dies', [S('goldvein')], { subj: 'self', label: 'Treasures equal to power' })),
  },
  'Lifeblood Hydra': {
    'when ~ dies, you gain life and draw cards equal to its power': d =>
      trig(d, T('dies', [S('lifeblood')], { subj: 'self', label: 'gain life and draw' })),
  },
  'Mana Bloom': {
    "at the beginning of your upkeep, if ~ has no charge counters on it, return it to its owner's hand": d =>
      trig(d, T('upkeep', [{ op: 'bounce', who: 'self' }], { pl: 'you', ifc: { k: 'ctrEq', kind: 'charge', n: 0 }, label: 'return to hand' })),
  },
  'Open the Way': {
    "x can't be greater than the number of players in the game": d => { /* enforced in runSoc / canCast clamp */ },
    'reveal cards from the top of your library until you reveal x land cards. put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random order': d =>
      spell(d, [S('openWay')]),
  },
  'Primordial Hydra': {
    'at the beginning of your upkeep, double the number of +1/+1 counters on ~': d =>
      trig(d, T('upkeep', [S('doubleP1', { who: 'self' })], { pl: 'you', label: 'double +1/+1 counters' })),
    '~ has trample as long as it has ten or more +1/+1 counters on it': d =>
      st(d, { k: 'kw', who: 'self', kws: ['trample'], cond: { k: 'ctrGE', kind: '+1/+1', n: 10 } }),
  },
  'Silkguard': {
    'auras, equipment, and modified creatures you control gain hexproof until end of turn': d =>
      spell(d, [S('silkguard')]),
  },
  'Altered Ego': {
    'you may have ~ enter as a copy of any creature on the battlefield, except it enters with x additional +1/+1 counters on it': d => { trig(d, T('etb', [S('alteredEgo')], { subj: 'self', label: 'copy with X counters' })); },
  },
  'Biomass Mutation': {
    'creatures you control have base power and toughness x/x until end of turn': d =>
      spell(d, [S('biomass')]),
  },
  "Grove's Bounty": {
    'distribute x +1/+1 counters among any number of target creatures you control': d => spell(d, [S('groveBounty')]),
  },
  "Elusive Otter // Grove's Bounty": {
    'adventure: distribute x +1/+1 counters among any number of target creatures you control': d => {
      if (d.back) d.back.spell = { effects: [S('groveBounty')], tslots: [{ who: 'perm', f: YOUR_CREATURES, opt: true }] };
      else spell(d, [S('groveBounty')]);
    },
  },
  'The Goose Mother': {
    'when ~ enters, create half x food tokens, rounded up': d =>
      trig(d, T('etb', [S('gooseFood')], { subj: 'self', label: 'create Foods' })),
  },
  'Hydroid Krasis': {
    'when you cast ~, you gain half x life and draw half x cards. round down each time': d =>
      trig(d, T('castSelf', [S('hydroid')], { label: 'gain life and draw' })),
  },
  'Oversimplify': {
    'exile all creatures. each player creates a 0/0 green and blue fractal creature token and puts a number of +1/+1 counters on it equal to the total power of creatures they controlled that were exiled this way': d =>
      spell(d, [S('oversimplify')]),
  },
  'Quandrix Command': {
    'choose two —\n• return target creature or planeswalker to its owner\'s hand.\n• counter target artifact or enchantment spell.\n• put two +1/+1 counters on target creature.\n• target player shuffles up to three target cards from their graveyard into their library': d => {
      d.spell = { effects: [], modes: { min: 2, max: 2, list: [
        { label: 'Bounce a creature or planeswalker', tslots: [{ who: 'perm', f: { anyType: ['Creature', 'Planeswalker'] }, harm: true }], effects: [{ op: 'bounce', who: 't0' }] },
        { label: 'Counter an artifact or enchantment spell', tslots: [{ who: 'spell', f: { anyType: ['Artifact', 'Enchantment'] }, harm: true }], effects: [{ op: 'counter', who: 't0' }] },
        { label: 'Two +1/+1 counters', tslots: [{ who: 'perm', f: { types: ['Creature'] } }], effects: [{ op: 'addC', who: 't0', kind: '+1/+1', n: 2 }] },
        { label: 'Shuffle up to three cards', tslots: [{ who: 'player' }, { who: 'card', zoneOwner: 'any', opt: true }, { who: 'card', zoneOwner: 'any', opt: true, distinct: true }, { who: 'card', zoneOwner: 'any', opt: true, distinct: true }], effects: [S('quandrixShuffle')] },
      ] } };
    },
  },
  'Tanazir Quandrix': {
    'when ~ enters, double the number of +1/+1 counters on target creature you control': d =>
      trig(d, T('etb', [S('doubleP1', { who: 't0' })], { subj: 'self', label: 'double +1/+1 counters', tslots: [{ who: 'perm', f: YOUR_CREATURES }] })),
    "whenever ~ attacks, you may have the base power and toughness of other creatures you control become equal to ~'s power and toughness until end of turn": d =>
      trig(d, T('attacks', [S('tanazir')], { subj: 'self', label: 'maybe set base P/T' })),
  },
  'Zimone, All-Questioning': {
    'at the beginning of your end step, if a land entered the battlefield under your control this turn and you control a prime number of lands, create primo, the indivisible, a legendary 0/0 green and blue fractal creature token, then put that many +1/+1 counters on it': d =>
      trig(d, T('endStep', [S('zimonePrimo')], { pl: 'you', label: 'maybe create Primo' })),
  },
  "Elementalist's Palette": {
    'whenever you cast a spell with {x} in its mana cost, put two charge counters on ~': d =>
      trig(d, T('cast', [{ op: 'addC', who: 'self', kind: 'charge', n: 2 }], { pl: 'you', f: { hasX: true }, label: 'two charge counters' })),
    '{t}: add {c} for each charge counter on ~. spend this mana only on costs that contain {x}': d => { (d.mana ??= []).push({ add: ['C'], n: { ctr: 'charge', who: 'self' }, tap: true, only: 'xCost' }); },
  },
  "Alchemist's Refuge": {
    '{g}{u}, {t}: you may cast spells this turn as though they had flash': d =>
      abil(d, { label: 'Spells you cast this turn have flash', mana: { G: 1, U: 1, generic: 0 }, tap: true, effects: [S('alchemistFlash')] }),
  },
  'Oran-Rief, the Vastwood': {
    '{t}: put a +1/+1 counter on each green creature that entered this turn': d =>
      abil(d, { label: '+1/+1 on green creatures that entered this turn', tap: true, effects: [S('oranRief')] }),
  },
  'Troyan, Gutsy Explorer': {
    '{t}: add {g}{u}. spend this mana only to cast spells with mana value 5 or greater or spells with {x} in their mana costs': d => { (d.mana ??= []).push({ add: ['G', 'U'], tap: true, only: 'mv5orX' }); },
  },
};
