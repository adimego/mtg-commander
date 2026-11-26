/** Remaining FIC leftover scripts (exact unparsed keys, no trailing period). */
import type { CardDef, Effect, TriggerDef, TSlot, TokenSpec, Filter, ActAbility, Static } from './types';
import { S, T, trig, spell, abil, st, HERO, MOOGLE, REBEL, SOLDIER, TREASURE, ZOMBIE } from './fic-scripts';

type Patch = (d: CardDef) => void;
const C: Filter = { types: ['Creature'], ctrl: 'you' };
const EQ: Filter = { anyType: ['Equipment'], ctrl: 'you' };
const SPIRIT: TokenSpec = { name: 'Spirit', p: 1, t: 1, colors: ['W'], types: ['Creature'], sub: ['Spirit'], kws: ['flying'] };
const WIZARD: TokenSpec = { name: 'Wizard', p: 0, t: 1, colors: ['B'], types: ['Creature'], sub: ['Wizard'], ext: { text: 'Whenever you cast a noncreature spell, this creature deals 1 damage to each opponent.', triggers: [{ on: 'x', ev: 'cast', pl: 'you', filter: 'noncreature', label: '1 damage to each opponent', effects: [{ op: 'damage', n: 1, pl: 'opps' }] }] } };
const BLACKJACK: TokenSpec = { name: 'The Blackjack', p: 3, t: 3, colors: [], types: ['Artifact'], sub: ['Vehicle'], kws: ['flying'], legendary: true, ext: { text: 'Crew 2', abilities: [{ label: 'Crew 2', crew: 2, effects: [] }] } };

export const FIC_LEFTOVERS: Record<string, Record<string, Patch>> = {

  "Archfiend of Depravity": {
    "at the beginning of each opponent's end step, that player chooses up to two creatures they control, then sacrifices the rest": d => trig(d, T('endStep', [S('archfiendSac')], { pl: 'opp', label: 'that player sacrifices all but two creatures' })),
  },
  "Armory Automaton": {
    "whenever ~ enters or attacks, you may attach any number of target equipment to it": d => { const fx = [S('armoryAttach')]; trig(d, T('etb', fx, { subj: 'self', label: 'attach Equipment' }), T('attacks', fx, { subj: 'self', label: 'attach Equipment' })); },
  },
  "Auron, Venerated Guardian": {
    "shooting star — whenever ~ attacks, put a +1/+1 counter on it. when you do, exile target creature defending player controls with power less than ~'s power until ~ leaves the battlefield": d => trig(d, T('attacks', [{ op: 'addC', kind: '+1/+1', n: 1, who: 'self' }, { op: 'ring', who: 't0' }], { subj: 'self', label: 'Shooting Star', tslots: [{ who: 'perm', opt: true, f: { types: ['Creature'], defP: true, powLTSrc: true }, harm: true }] })),
  },
  "Avalanche of Sector 7": {
    "whenever an opponent activates an ability of an artifact they control, ~ deals 1 damage to that player": d => trig(d, T('activate', [{ op: 'damage', n: 1, pl: 'evp' }], { pl: 'opp', f: { types: ['Artifact'] }, label: '1 damage' })),
  },
  "Bane of Progress": {
    "when ~ enters, destroy all artifacts and enchantments. put a +1/+1 counter on ~ for each permanent destroyed this way": d => trig(d, T('etb', [S('baneProgress')], { subj: 'self', label: 'destroy artifacts and enchantments' })),
  },
  "Banon, the Returners' Leader": {
    "pray — once during each of your turns, you may cast a creature spell from among cards in your graveyard that were put there from anywhere other than the battlefield this turn": d => { (d as any).ficPray = true; },
    "whenever you attack, you may pay {1} and discard a card. if you do, draw a card": d => trig(d, T('youAttack', [S('banonLoot')], { pl: 'you', label: 'you may pay {1} and discard a card to draw' })),
  },
  "Barret Wallace": {
    "whenever ~ attacks, it deals damage equal to the number of equipped creatures you control to defending player": d => trig(d, T('attacks', [S('barretDmg')], { subj: 'self', label: 'damage defending player' })),
  },
  "Barret, Avalanche Leader": {
    "avalanche! — whenever an equipment you control enters, create a 2/2 red rebel creature token": d => trig(d, T('etb', [{ op: 'token', n: 1, tok: REBEL }], { subj: 'any', f: { anyType: ['Equipment'], ctrl: 'you' }, label: 'Avalanche!' })),
    "at the beginning of combat on your turn, attach up to one target equipment you control to target rebel you control": d => trig(d, T('beginCombat', [{ op: 'attach', who: 't0', other: 't1' }], { pl: 'you', label: 'attach an Equipment to a Rebel', tslots: [{ who: 'perm', opt: true, f: EQ }, { who: 'perm', opt: true, f: { types: ['Creature'], ctrl: 'you' } }] })),
  },
  "Blitzball Stadium": {
    "when ~ enters, support x": d => trig(d, T('etb', [S('supportX')], { subj: 'self', label: 'support X' })),
    "go for the goal! — {3}, {t}: until end of turn, target creature gains \"whenever ~ deals combat damage to a player, draw a card for each kind of counter on it\" and it can't be blocked this turn": d => abil(d, { label: 'Go for the Goal!', mana: { generic: 3 }, tap: true, tslots: [{ who: 'perm', f: { types: ['Creature'] } }], effects: [S('blitzGoal')] }),
  },
  "Cait Sith, Fortune Teller": {
    "lucky slots — at the beginning of combat on your turn, scry 1, then exile the top card of your library. you may play that card this turn. when you exile a card this way, target creature you control gets +x/+0 until end of turn, where x is that card's mana value": d => trig(d, T('beginCombat', [S('caitSlots')], { pl: 'you', label: 'Lucky Slots', tslots: [{ who: 'perm', f: C }] })),
  },
  "Champion's Helm": {
    "as long as equipped creature is legendary, it has hexproof": d => st(d, { k: 'kw', who: 'attached', f: { legendary: true }, kws: ['hexproof'] }),
  },
  "Cid, Freeflier Pilot": {
    "jump — during your turn, cid has flying": d => st(d, { k: 'kw', who: 'self', kws: ['flying'], cond: { k: 'yourTurn' } }),
  },
  "Coin of Fate": {
    "{3}{w}, {t}, exile two creature cards from your graveyard, sacrifice ~: an opponent chooses one of the exiled cards. you put that card on the bottom of your library and return the other to the battlefield tapped. you become the monarch": d => abil(d, { label: 'Coin of Fate', mana: { generic: 3, W: 1 }, tap: true, sac: true, exileGy: { f: { types: ['Creature'] }, n: 2 }, effects: [S('coinFate')] }),
  },
  "Combustible Gearhulk": {
    "when ~ enters, target opponent may have you draw three cards. if the player doesn't, you mill three cards, then ~ deals damage to that player equal to the total mana value of those cards": d => trig(d, T('etb', [S('combustible')], { subj: 'self', label: 'draw or mill and damage', tslots: [{ who: 'opp' }] })),
  },
  "Conformer Shuriken": {
    "equipped creature has \"whenever ~ attacks, tap target creature defending player controls. if that creature has greater power than ~, put a number of +1/+1 counters on ~ equal to the difference.\"": d => st(d, { k: 'grantAbil', who: 'attached', grant: { triggers: [T('attacks', [S('conformerAtk')], { subj: 'self', label: 'tap a creature, maybe +1/+1s', tslots: [{ who: 'perm', f: { types: ['Creature'], defP: true }, harm: true }] })] } }),
  },
  "Conqueror's Flail": {
    "equipped creature gets +1/+1 for each color among permanents you control": d => st(d, { k: 'pt', who: 'attached', p: { ffColors: true }, t: { ffColors: true } }),
    "as long as ~ is attached to a creature, your opponents can't cast spells during your turn": d => st(d, { k: 'oppsCantCast', who: 'self', cond: { k: 'yourTurn' } }),
  },
  "Damning Verdict": {
    "destroy all creatures with no counters on them": d => spell(d, [S('damningVerdict')]),
  },
  "Decimate": {
    "destroy target artifact, target creature, target enchantment, and target land": d => spell(d, [{ op: 'destroy', who: 't0' }, { op: 'destroy', who: 't1' }, { op: 'destroy', who: 't2' }, { op: 'destroy', who: 't3' }], [{ who: 'perm', f: { types: ['Artifact'] }, harm: true }, { who: 'perm', f: { types: ['Creature'] }, harm: true }, { who: 'perm', f: { types: ['Enchantment'] }, harm: true }, { who: 'perm', f: { types: ['Land'] }, harm: true }]),
  },
  "Demolition Field": {
    "{2}, {t}, sacrifice ~: destroy target nonbasic land an opponent controls. that land's controller may search their library for a basic land card, put it onto the battlefield, then shuffle. you may search your library for a basic land card, put it onto the battlefield, then shuffle": d => abil(d, { label: 'Demolish', mana: { generic: 2 }, tap: true, sac: true, tslots: [{ who: 'perm', f: { types: ['Land'], nonbasic: true, ctrl: 'opp' }, harm: true }], effects: [S('demoField')] }),
  },
  "Duskshell Crawler": {
    "each creature you control with a +1/+1 counter on it has trample": d => st(d, { k: 'kw', who: 'all', f: { types: ['Creature'], ctrl: 'you', ctr: '+1/+1' }, kws: ['trample'] }),
  },
  "Edgar, Master Machinist": {
    "once during each of your turns, you may cast an artifact spell from your graveyard. if you cast a spell this way, that artifact enters tapped": d => { (d as any).ficEdgar = true; },
    "tools — whenever ~ attacks, it gets +x/+0 until end of turn, where x is the greatest mana value among artifacts you control": d => trig(d, T('attacks', [S('edgarTools')], { subj: 'self', label: 'Tools' })),
  },
  "Emet-Selch of the Third Seat": {
    "spells you cast from your graveyard cost {2} less to cast": d => st(d, { k: 'costLess', who: 'all', n: 2, fromNotHand: true }),
    "whenever one or more opponents lose life, you may cast target instant or sorcery card from your graveyard. if that spell would be put into your graveyard, exile it instead. do this only once each turn": d => trig(d, T('loseLife', [S('emetCast')], { pl: 'opp', batch: true, once: true, label: 'cast an instant or sorcery from your graveyard', tslots: [{ who: 'card', zoneOwner: 'you', opt: true, f: { anyType: ['Instant', 'Sorcery'] } }] })),
  },
  "Endless Detour": {
    "the owner of target spell, nonland permanent, or card in a graveyard puts it on their choice of the top or bottom of their library": d => spell(d, [S('endlessDetour')], [{ who: 'stack', opt: false }]),
  },
  "Espers to Magicite": {
    "exile each opponent's graveyard. when you do, choose up to one target creature card exiled this way. create a token that's a copy of that card, except it's an artifact and it loses all other card types": d => spell(d, [S('espersMagicite')], [{ who: 'card', zoneOwner: 'opp', opt: true, f: { types: ['Creature'] } }]),
  },
  "Estinien Varlineau": {
    "at the beginning of your second main phase, you draw x cards and lose x life, where x is the number of your opponents who were dealt combat damage by ~ or a dragon this turn": d => trig(d, T('secondMain', [S('estinienDraw')], { pl: 'you', label: 'draw X, lose X life' })),
  },
  "Explorer's Scope": {
    "whenever equipped creature attacks, look at the top card of your library. if it's a land card, you may put it onto the battlefield tapped": d => trig(d, T('attacks', [S('explorerScope')], { subj: 'attached', label: 'look at the top card' })),
  },
  "Eye of Nidhogg": {
    "enchanted creature is a black dragon with base power and toughness 4/2, has flying and deathtouch, and is goaded": d => st(d, { k: 'addSub', who: 'attached', kws: ['Dragon'] }, { k: 'basePT', who: 'attached', p: 4, t: 2 }, { k: 'kw', who: 'attached', kws: ['flying', 'deathtouch'] }, { k: 'goad', who: 'attached' }),
  },
  "Fandaniel, Telophoroi Ascian": {
    "at the beginning of your end step, each opponent may sacrifice a nontoken creature. each opponent who doesn't loses 2 life for each instant and sorcery card in your graveyard": d => trig(d, T('endStep', [S('fandaniel')], { pl: 'you', label: 'opponents sacrifice or lose life' })),
  },
  "Fight Rigging": {
    "at the beginning of combat on your turn, put a +1/+1 counter on target creature you control. then if you control a creature with power 7 or greater, you may play the exiled card without paying its mana cost": d => trig(d, T('beginCombat', [{ op: 'addC', kind: '+1/+1', n: 1, who: 't0' }, S('fightRigging')], { pl: 'you', label: 'put a +1/+1 counter, maybe play the exiled card', tslots: [{ who: 'perm', f: C }] })),
  },
  "Flayer of the Hatebound": {
    "whenever ~ or another creature enters from your graveyard, that creature deals damage equal to its power to any target": d => trig(d, T('etb', [S('flayerDmg')], { subj: 'any', f: { types: ['Creature'] }, label: 'deals damage equal to its power', tslots: [{ who: 'any', harm: true }] })),
  },
  "Forge of Heroes": {
    "{t}: choose target commander that entered this turn. put a +1/+1 counter on it if it's a creature and a loyalty counter on it if it's a planeswalker": d => abil(d, { label: 'Forge', tap: true, manaAb: true, tslots: [{ who: 'perm', f: { cmdr: 'own' } }], effects: [S('forgeHeroes')] }),
  },
  "Furious Rise": {
    "at the beginning of your end step, if you control a creature with power 4 or greater, exile the top card of your library. you may play that card until you exile another card with ~": d => trig(d, T('endStep', [S('furiousRise')], { pl: 'you', ifc: { k: 'control', f: { types: ['Creature'], ctrl: 'you', powGE: 4 } }, label: 'exile the top card' })),
  },
  "Gatta and Luzzu": {
    "when ~ enters, choose target creature you control. if damage would be dealt to that creature this turn, prevent that damage and put that many +1/+1 counters on it": d => trig(d, T('etb', [S('gattaPrevent')], { subj: 'self', label: 'prevent damage and put +1/+1s', tslots: [{ who: 'perm', f: C }] })),
  },
  "Gau, Feral Youth": {
    "rage — whenever gau attacks, put a +1/+1 counter on it": d => trig(d, T('attacks', [{ op: 'addC', kind: '+1/+1', n: 1, who: 'self' }], { subj: 'self', label: 'Rage' })),
    "at the beginning of each end step, if a card left your graveyard this turn, gau deals damage equal to its power to each opponent": d => trig(d, T('endStep', [S('gauRage')], { pl: 'any', ifc: { k: 'leftGyYou' }, label: 'damage each opponent' })),
  },
  "Generous Patron": {
    "when ~ enters, support 2": d => trig(d, T('etb', [S('supportN', { n: 2 })], { subj: 'self', label: 'support 2' })),
    "whenever you put one or more counters on a creature you don't control, draw a card": d => trig(d, T('counterPut', [S('patronDraw')], { pl: 'you', label: 'draw a card' })),
  },
  "Grateful Apparition": {
    "whenever ~ deals combat damage to a player or planeswalker, proliferate": d => trig(d, T('combatDamagePlayer', [{ op: 'proliferate' }], { subj: 'self', label: 'proliferate' })),
  },
  "Heidegger, Shinra Executive": {
    "at the beginning of your end step, create a number of 1/1 white soldier creature tokens equal to the number of opponents who control more creatures than you": d => trig(d, T('endStep', [S('heideggerTok')], { pl: 'you', label: 'create Soldiers' })),
  },
  "Helitrooper": {
    "equip abilities you activate that target ~ cost {2} less to activate": d => st(d, { k: 'taxAct', who: 'self', n: -2 }),
  },
  "Hellkite Tyrant": {
    "whenever ~ deals combat damage to a player, gain control of all artifacts that player controls": d => trig(d, T('combatDamagePlayer', [S('hellkiteSteal')], { subj: 'self', label: 'gain control of artifacts' })),
    "at the beginning of your upkeep, if you control twenty or more artifacts, you win the game": d => trig(d, T('upkeep', [S('hellkiteWin')], { pl: 'you', label: 'you win the game' })),
  },
  "Hermes, Overseer of Elpis": {
    "whenever you attack with one or more birds, scry 2": d => trig(d, T('youAttack', [{ op: 'scry', n: 2 }], { pl: 'you', ifc: { k: 'control', f: { types: ['Creature'], attacking: true } }, label: 'scry 2' })),
  },
  "Hero's Heirloom": {
    "as long as equipped creature is legendary, it has trample and haste": d => st(d, { k: 'kw', who: 'attached', f: { legendary: true }, kws: ['trample', 'haste'] }),
  },
  "Hildibrand Manderville // Gentleman's Rise": {
    "when ~ dies, you may cast it from your graveyard as an adventure until the end of your next turn": d => trig(d, T('dies', [S('hildiAdventure')], { subj: 'self', label: 'you may cast it as an Adventure' })),
  },
  "Hraesvelgr of the First Brood": {
    "shiva's aid — when ~ enters and whenever you cast a noncreature spell, target creature gets +1/+0 until end of turn and can't be blocked this turn": d => { const fx = [S('hraesvelgrAid')]; const slots: TSlot[] = [{ who: 'perm', f: { types: ['Creature'] } }]; trig(d, T('etb', fx, { subj: 'self', label: "Shiva's Aid", tslots: slots }), T('cast', fx, { pl: 'you', filter: 'noncreature', label: "Shiva's Aid", tslots: slots } as any)); },
  },
  "Interceptor, Shadow's Hound": {
    "whenever you attack with one or more legendary creatures, you may pay {2}{b}. if you do, return ~ from your graveyard to the battlefield tapped and attacking": d => trig(d, T('youAttack', [S('interceptorRet')], { pl: 'you', gy: true, label: 'you may pay {2}{B} to return it attacking' })),
  },
  "Into the Story": {
    "~ costs {3} less to cast if an opponent has seven or more cards in their graveyard": d => st(d, { k: 'costLess', who: 'self', n: 3, cond: { k: 'oppGyGE', n: 7 } }),
  },
  "Kefka, Dancing Mad": {
    "at the beginning of your end step, exile a card at random from each opponent's graveyard. you may cast any number of spells from among cards exiled this way without paying their mana costs. then each player who owns a spell you cast this way loses life equal to its mana value": d => trig(d, T('endStep', [S('kefkaCast')], { pl: 'you', label: 'exile and maybe cast' })),
  },
  "Key to the City": {
    "whenever ~ becomes untapped, you may pay {2}. if you do, draw a card": d => trig(d, T('untaps', [S('keyDraw')], { subj: 'self', label: 'you may pay {2} to draw' })),
  },
  "Kimahri, Valiant Guardian": {
    "ronso rage — at the beginning of combat on your turn, put a +1/+1 counter on ~ and tap target creature an opponent controls. then you may have ~ become a copy of that creature, except its name is ~ and it has vigilance and this ability": d => trig(d, T('beginCombat', [{ op: 'addC', kind: '+1/+1', n: 1, who: 'self' }, { op: 'tap', who: 't0' }, S('kimahriCopy')], { pl: 'you', label: 'Ronso Rage', tslots: [{ who: 'perm', f: { types: ['Creature'], ctrl: 'opp' }, harm: true }] })),
  },
  "Krile Baldesion": {
    "trace aether — whenever you cast a noncreature spell, you may return target creature card with mana value equal to that spell's mana value from your graveyard to your hand. do this only once each turn": d => trig(d, T('cast', [S('krileTrace')], { pl: 'you', filter: 'noncreature', once: true, label: 'Trace Aether', tslots: [{ who: 'card', zoneOwner: 'you', opt: true, f: { types: ['Creature'] } }] })),
  },
  "Legions to Ashes": {
    "exile target nonland permanent an opponent controls and all tokens that player controls with the same name as that permanent": d => spell(d, [S('legionsAshes')], [{ who: 'perm', f: { notTypes: ['Land'], ctrl: 'opp' }, harm: true }]),
  },
  "Lifestream's Blessing": {
    "draw x cards, where x is the greatest power among creatures you controlled as you cast ~. if ~ was cast from exile, you gain twice x life": d => spell(d, [S('lifestream')]),
  },
  "Locke, Treasure Hunter": {
    "~ can't be blocked by creatures with greater power": d => st(d, { k: 'cantBeBlockedBy', who: 'self', f: { types: ['Creature'] } }),
    "mug — whenever ~ attacks, each player mills a card. if a land card was milled this way, create a treasure token. until end of turn, you may cast a spell from among those cards": d => trig(d, T('attacks', [S('lockeMug')], { subj: 'self', label: 'Mug' })),
  },
  "Lulu, Stern Guardian": {
    "whenever an opponent attacks you, choose target creature attacking you. put a stun counter on that creature": d => trig(d, T('attackPlayer', [{ op: 'addC', kind: 'stun', n: 1, who: 't0' }], { pl: 'opp', label: 'stun an attacker', tslots: [{ who: 'perm', f: { types: ['Creature'], attacking: true } }] })),
  },
  "Luminous Broodmoth": {
    "whenever a creature you control without flying dies, return it to the battlefield under its owner's control with a flying counter on it": d => trig(d, T('dies', [S('broodmoth')], { subj: 'any', f: { types: ['Creature'], ctrl: 'you', noKw: 'flying' }, label: 'return with a flying counter' })),
  },
  "Lyse Hext": {
    "as long as you've cast two or more noncreature spells this turn, ~ has double strike": d => st(d, { k: 'kw', who: 'self', kws: ['double strike'], cond: { k: 'castNoncThisTurn', n: 2 } }),
  },
  "Maester Seymour": {
    "at the beginning of combat on your turn, put a number of +1/+1 counters equal to ~'s power on another target creature you control": d => trig(d, T('beginCombat', [S('seymourBoost')], { pl: 'you', label: 'put +1/+1 counters', tslots: [{ who: 'perm', f: { types: ['Creature'], ctrl: 'you', other: true } }] })),
    "{3}{g}{g}: monstrosity x, where x is the number of counters among creatures you control": d => abil(d, { label: 'Monstrosity X', mana: { generic: 3, G: 2 }, effects: [S('seymourMonstrosity')] }),
  },
  "Mog, Moogle Warrior": {
    "dance — at the beginning of your end step, each player may discard a card. each player who discarded a card this way draws a card. if a creature card was discarded this way, you create a 1/2 white moogle creature token with lifelink. then if a noncreature card was discarded this way, put a +1/+1 counter on each moogle you control": d => trig(d, T('endStep', [S('mogDance')], { pl: 'you', label: 'Dance' })),
  },
  "Nesting Grounds": {
    "{1}, {t}: move a counter from target permanent you control onto a second target permanent. activate only as a sorcery": d => abil(d, { label: 'Move a counter', mana: { generic: 1 }, tap: true, sorcery: true, tslots: [{ who: 'perm', f: { ctrl: 'you' } }, { who: 'perm', f: {}, distinct: true }], effects: [S('moveCtr')] }),
  },
  "O'aka, Traveling Merchant": {
    "{t}, remove a counter from a nonland permanent you control: draw a card": d => abil(d, { label: "Draw", tap: true, effects: [S('oakaDraw')] }),
  },
  "Observed Stasis": {
    "when ~ enters, remove enchanted creature from combat. then draw a card for each tapped creature its controller controls": d => trig(d, T('etb', [S('observedStasis')], { subj: 'self', label: 'remove from combat and draw' })),
    "enchanted creature loses all abilities and can't attack or block": d => st(d, { k: 'loseKw', who: 'attached', kws: ['*'] }, { k: 'cantAttack', who: 'attached' }, { k: 'cantBlock', who: 'attached' }),
  },
  "Papalymo Totolymo": {
    "{4}, {t}, sacrifice ~: each opponent who lost life this turn sacrifices a creature with the greatest power among creatures they control": d => abil(d, { label: 'Papalymo', mana: { generic: 4 }, tap: true, sac: true, effects: [S('papalymo')] }),
  },
  "Professor Hojo": {
    "the first activated ability you activate during your turn that targets a creature you control costs {2} less to activate": d => st(d, { k: 'taxAct', who: 'self', n: -2, tgtCreature: true, firstX: true }),
    "whenever one or more creatures you control become the target of an activated ability, draw a card. this ability triggers only once each turn": d => trig(d, T('targeted', [S('hojoDraw')], { pl: 'you', once: true, label: 'draw a card' })),
  },
  "Puresteel Paladin": {
    "metalcraft — equipment you control have equip {0} as long as you control three or more artifacts": d => st(d, { k: 'equip0Metalcraft', who: 'all', f: { anyType: ['Equipment'], ctrl: 'you' } }),
  },
  "Rampant Rejuvenator": {
    "when ~ dies, search your library for up to x basic land cards, where x is ~'s power, put them onto the battlefield, then shuffle": d => trig(d, T('dies', [S('rampantSearch')], { subj: 'self', label: 'search for lands' })),
  },
  "Red XIII, Proud Warrior": {
    "other modified creatures you control have vigilance and trample": d => st(d, { k: 'kw', who: 'all', f: { types: ['Creature'], ctrl: 'you', modified: true, other: true }, kws: ['vigilance', 'trample'] }),
  },
  "Rejoin the Fight": {
    "mill three cards. then starting with the next opponent in turn order, each opponent chooses a creature card in your graveyard that hasn't been chosen. return each card chosen this way to the battlefield under your control": d => spell(d, [{ op: 'mill', n: 3, pl: 'you' }, S('rejoinFight')]),
  },
  "Resourceful Defense": {
    "whenever a permanent you control leaves the battlefield, if it had counters on it, put those counters on target permanent you control": d => trig(d, T('ltb', [S('resDefMove')], { subj: 'any', f: { ctrl: 'you' }, label: 'put those counters on a permanent', tslots: [{ who: 'perm', f: { ctrl: 'you' } }] })),
    "{4}{w}: move any number of counters from target permanent you control onto a second target permanent you control": d => abil(d, { label: 'Move counters', mana: { generic: 4, W: 1 }, tslots: [{ who: 'perm', f: { ctrl: 'you' } }, { who: 'perm', f: { ctrl: 'you' }, distinct: true }], effects: [S('moveAnyCtrs')] }),
  },
  "Rikku, Resourceful Guardian": {
    "whenever you put one or more counters on a creature, until end of turn, that creature can't be blocked by creatures your opponents control": d => trig(d, T('counterPut', [S('rikkuUnblock')], { pl: 'you', label: "can't be blocked" })),
    "steal — {1}, {t}: move a counter from target creature an opponent controls onto target creature you control. activate only as a sorcery": d => abil(d, { label: 'Steal', mana: { generic: 1 }, tap: true, sorcery: true, tslots: [{ who: 'perm', f: { types: ['Creature'], ctrl: 'opp' }, harm: true }, { who: 'perm', f: C }], effects: [S('moveCtr')] }),
  },
  "Sabin, Master Monk": {
    "blitz—{2}{r}{r}, discard a card": d => { (d as any).ficBlitz = { generic: 2, R: 2, discard: 1 }; },
    "you may cast ~ from your graveyard using its blitz ability": d => { (d as any).ficBlitzFromGy = true; },
  },
  "Scholar of New Horizons": {
    "{t}, remove a counter from a permanent you control: search your library for a plains card and reveal it. if an opponent controls more lands than you, you may put that card onto the battlefield tapped. if you don't put the card onto the battlefield, put it into your hand. then shuffle": d => abil(d, { label: 'Search for a Plains', tap: true, effects: [S('scholarPlains')] }),
  },
  "Sephiroth, Fallen Hero": {
    "jenova cells — whenever ~ attacks, you may put a cell counter on target creature. until end of turn, each modified creature you control has base power and toughness 7/5": d => trig(d, T('attacks', [S('sephirothCells')], { subj: 'self', label: 'Jenova Cells', tslots: [{ who: 'perm', opt: true, f: { types: ['Creature'] } }] })),
    "the reunion — {3}, sacrifice a modified creature: return ~ from your graveyard to the battlefield tapped": d => abil(d, { label: 'The Reunion', mana: { generic: 3 }, sacF: { f: { modified: true, types: ['Creature'] }, n: 1 }, zone: 'graveyard', effects: [S('sephirothReunion')] }),
  },
  "Sepulchral Primordial": {
    "when ~ enters, for each opponent, you may put up to one target creature card from that player's graveyard onto the battlefield under your control": d => trig(d, T('etb', [S('sepulchral')], { subj: 'self', label: 'return a creature from each graveyard' })),
  },
  "Setzer, Wandering Gambler": {
    "when ~ enters, create the blackjack, a legendary 3/3 colorless vehicle artifact token with flying and crew 2": d => trig(d, T('etb', [{ op: 'token', n: 1, tok: BLACKJACK }], { subj: 'self', label: 'create The Blackjack' })),
    "whenever a vehicle you control deals combat damage to a player, flip a coin": d => trig(d, T('combatDamagePlayer', [S('setzerFlip')], { subj: 'any', f: { anyType: ['Vehicle'], ctrl: 'you' }, label: 'flip a coin' })),
    "whenever you win a coin flip, create two tapped treasure tokens": d => trig(d, T('winFlip', [{ op: 'token', n: 2, tok: TREASURE, tapped: true }], { pl: 'you', label: 'create Treasures' })),
  },
  "Shadow, Mysterious Assassin": {
    "throw — whenever ~ deals combat damage to a player, you may sacrifice another nonland permanent. if you do, draw two cards and each opponent loses life equal to the mana value of the sacrificed permanent": d => trig(d, T('combatDamagePlayer', [S('shadowThrow')], { subj: 'self', label: 'Throw' })),
  },
  "Shelinda, Yevon Acolyte": {
    "whenever another creature you control enters, put a +1/+1 counter on that creature if its power is less than ~'s power. otherwise, put a +1/+1 counter on ~": d => trig(d, T('etb', [S('shelinda')], { subj: 'other', f: C, label: 'put a +1/+1 counter' })),
  },
  "Siegfried, Famed Swordsman": {
    "when ~ enters, mill three cards. then put x +1/+1 counters on ~, where x is twice the number of creature cards in your graveyard": d => trig(d, T('etb', [{ op: 'mill', n: 3, pl: 'you' }, S('siegfriedCtrs')], { subj: 'self', label: 'mill and get +1/+1 counters' })),
  },
  "Incubation Druid": {
    "{t}: add one mana of any type that a land you control could produce. if ~ has a +1/+1 counter on it, add three mana of that type instead": d => { (d.mana ??= []).push({ add: ['ANY'], tap: true }); (d as any).ficIncubate = true; },
    "{3}{g}{g}: adapt 3": d => abil(d, { label: 'Adapt 3', mana: { generic: 3, G: 2 }, effects: [S('adaptN', { n: 3 })] }),
  },
  "Sin, Unending Cataclysm": {
    "as sin enters, remove all counters from any number of artifacts, creatures, and enchantments. sin enters with x +1/+1 counters on it, where x is twice the number of counters removed this way": d => { (d as any).ficSinEtb = true; },
    "when sin dies, put its counters on target creature you control, then shuffle ~ into its owner's library": d => trig(d, T('dies', [S('sinDies')], { subj: 'self', label: 'put its counters on a creature, then shuffle it', tslots: [{ who: 'perm', f: C }] })),
  },
  "Snort": {
    "each player may discard their hand and draw five cards. then ~ deals 5 damage to each opponent who discarded their hand this way": d => spell(d, [S('snort')]),
  },
  "Snuff Out": {
    "if you control a swamp, you may pay 4 life rather than pay ~'s mana cost": d => { d.costOrLife = { life: 4, pay: 0 }; (d as any).ficSwampLife = true; },
  },
  "SOLDIER Military Program": {
    "at the beginning of combat on your turn, choose one. if you control a commander, you may choose both instead.\n• create a 1/1 white soldier creature token.\n• put a +1/+1 counter on each of up to two soldiers you control": d => trig(d, T('beginCombat', [], { pl: 'you', label: 'SOLDIER Military Program', modes: { min: 1, max: 1, bothIf: { k: 'ctlCommander' }, list: [ { label: 'create a Soldier', effects: [{ op: 'token', n: 1, tok: SOLDIER }] }, { label: 'put a +1/+1 counter on up to two Soldiers', effects: [S('soldierP1')] } ] } })),
  },
  "Sphere Grid": {
    "unlock ability — creatures you control with +1/+1 counters on them have reach and trample": d => st(d, { k: 'kw', who: 'all', f: { types: ['Creature'], ctrl: 'you', ctr: '+1/+1' }, kws: ['reach', 'trample'] }),
  },
  "Stitch Together": {
    "threshold — return that card from your graveyard to the battlefield instead if there are seven or more cards in your graveyard": d => spell(d, [S('stitchTogether')], [{ who: 'card', zoneOwner: 'you', f: { types: ['Creature'] } }]),
  },
  "Strago and Relm": {
    "sketch and lore — {2}{r}, {t}: target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card. you may cast that card without paying its mana cost. if you cast a creature spell this way, it gains haste and \"at the beginning of the end step, sacrifice ~.\" activate only as a sorcery": d => abil(d, { label: 'Sketch and Lore', mana: { generic: 2, R: 1 }, tap: true, sorcery: true, tslots: [{ who: 'opp' }], effects: [S('stragoLore')] }),
  },
  "Summon: Esper Valigarmanda": {
    "i — exile an instant or sorcery card from each graveyard": d => trig(d, T('chapter', [S('valiExile')], { subj: 'self', ifc: { k: 'evAmt', n: 1 }, label: 'chapter I' })),
    "ii, iii, iv — add {r} for each lore counter on ~. you may cast an instant or sorcery card exiled with ~, and mana of any type can be spent to cast that spell": d => { for (const n of [2, 3, 4]) trig(d, T('chapter', [S('valiCast')], { subj: 'self', ifc: { k: 'evAmt', n }, label: `chapter ${n}` })); },
  },
  "Summon: Good King Mog XII": {
    "ii, iii — whenever you cast a noncreature spell this turn, create a token that's a copy of a non-saga token you control": d => { for (const n of [2, 3]) trig(d, T('chapter', [S('mogCopyWatch')], { subj: 'self', ifc: { k: 'evAmt', n }, label: `chapter ${n}` })); },
  },
  "Summon: Kujata": {
    "iii — fire — discard a card, then draw two cards. when you discard a card this way, ~ deals damage equal to that card's mana value to each opponent": d => trig(d, T('chapter', [S('kujataFire')], { subj: 'self', ifc: { k: 'evAmt', n: 3 }, label: 'III — Fire' })),
  },
  "Summon: Magus Sisters": {
    "i, ii, iii — choose one at random —\n• combine powers! — put three +1/+1 counters on target creature.\n• defense! — put a shield counter on target creature. you gain 3 life.\n• fight! — ~ fights up to one target creature an opponent controls": d => { for (const n of [1, 2, 3]) trig(d, T('chapter', [S('magusSisters')], { subj: 'self', ifc: { k: 'evAmt', n }, label: `chapter ${n}`, tslots: [{ who: 'perm', opt: true, f: { types: ['Creature'] } }, { who: 'perm', opt: true, f: { types: ['Creature'], ctrl: 'opp' }, harm: true }] })); },
  },
  "Summon: Valefor": {
    "i — sonic wings — each opponent chooses a creature with the greatest mana value among creatures they control. return those creatures to their owners' hands": d => trig(d, T('chapter', [S('valeforWings')], { subj: 'self', ifc: { k: 'evAmt', n: 1 }, label: 'I — Sonic Wings' })),
  },
  "Summon: Yojimbo": {
    "i — exile target artifact, enchantment, or tapped creature an opponent controls": d => trig(d, T('chapter', [{ op: 'exile', who: 't0' }], { subj: 'self', ifc: { k: 'evAmt', n: 1 }, label: 'chapter I', tslots: [{ who: 'perm', f: { ctrl: 'opp' }, harm: true }] })),
    "ii, iii — until your next turn, creatures can't attack you unless their controller pays {2} for each of those creatures": d => { for (const n of [2, 3]) trig(d, T('chapter', [S('yojimboTax')], { subj: 'self', ifc: { k: 'evAmt', n }, label: `chapter ${n}` })); },
    "iv — create x treasure tokens, where x is the number of opponents who control a creature with power 4 or greater": d => trig(d, T('chapter', [S('yojimboTreasure')], { subj: 'self', ifc: { k: 'evAmt', n: 4 }, label: 'chapter IV' })),
  },
  "Summoner's Sending": {
    "at the beginning of your end step, you may exile target creature card from a graveyard. if you do, create a 1/1 white spirit creature token with flying. put a +1/+1 counter on it if the exiled card's mana value is 4 or greater": d => trig(d, T('endStep', [S('summonerSend')], { pl: 'you', label: 'exile a creature card and create a Spirit', tslots: [{ who: 'card', zoneOwner: 'any', opt: true, f: { types: ['Creature'] } }] })),
  },
  "Tataru Taru": {
    "scions' secretary — whenever an opponent draws a card, if it isn't that player's turn, create a tapped treasure token. this ability triggers only once each turn": d => trig(d, T('drawCard', [{ op: 'token', n: 1, tok: TREASURE, tapped: true }], { pl: 'opp', ifc: { k: 'notYourTurn' }, once: true, label: "Scions' Secretary" })),
  },
  "Thancred Waters": {
    "royal guard — when ~ enters, another target legendary permanent you control gains indestructible for as long as you control ~": d => trig(d, T('etb', [S('thancredGuard')], { subj: 'self', label: 'Royal Guard', tslots: [{ who: 'perm', f: { legendary: true, ctrl: 'you', other: true } }] })),
  },
  "The Warring Triad": {
    "as long as there are fewer than eight cards in your graveyard, ~ isn't a creature": d => st(d, { k: 'devotionNotCreature', who: 'self', cond: { k: 'not', c: { k: 'gyGE', n: 8 } } }),
    "{t}, mill a card: target player adds one mana of any color": d => abil(d, { label: 'Mill for mana', tap: true, effects: [{ op: 'mill', n: 1, pl: 'you' }, S('triadMana')], tslots: [{ who: 'player' }] }),
  },
  "Together Forever": {
    "when ~ enters, support 2": d => trig(d, T('etb', [S('supportN', { n: 2 })], { subj: 'self', label: 'support 2' })),
    "{1}: choose target creature with a counter on it. when that creature dies this turn, return that card to its owner's hand": d => abil(d, { label: 'Together Forever', mana: { generic: 1 }, tslots: [{ who: 'perm', f: { types: ['Creature'], anyCtr: true } }], effects: [S('togetherWatch')] }),
  },
  "Torrential Gearhulk": {
    "when ~ enters, you may cast target instant card from your graveyard without paying its mana cost. if that spell would be put into your graveyard, exile it instead": d => trig(d, T('etb', [S('torrential')], { subj: 'self', label: 'cast an instant from your graveyard', tslots: [{ who: 'card', zoneOwner: 'you', opt: true, f: { types: ['Instant'] } }] })),
  },
  "Trailblazer's Boots": {
    "equipped creature has nonbasic landwalk": d => st(d, { k: 'kw', who: 'attached', kws: ['nonbasic landwalk'] }),
  },
  "Transpose": {
    "draw a card, then discard a card. you lose 1 life. if ~ was cast from your hand, create a 0/1 black wizard creature token with \"whenever you cast a noncreature spell, ~ deals 1 damage to each opponent.\"": d => spell(d, [{ op: 'draw', n: 1, pl: 'you' }, { op: 'discard', n: 1, pl: 'you' }, { op: 'lose', n: 1, pl: 'you' }, S('transposeTok')]),
  },
  "Tromell, Seymour's Butler": {
    "{1}, {t}: proliferate x times, where x is the number of nontoken creatures you control that entered this turn": d => abil(d, { label: 'Proliferate X', mana: { generic: 1 }, tap: true, effects: [S('tromellProlif')] }),
  },
  "Ultimate Magic: Holy": {
    "permanents you control gain indestructible until end of turn. if ~ was cast from exile, prevent all damage that would be dealt to you this turn": d => spell(d, [{ op: 'grant', who: { all: { ctrl: 'you' } }, kw: ['indestructible'] }, S('holyPrevent')]),
  },
  "Ultimate Magic: Meteor": {
    "~ deals 7 damage to each creature. if ~ was cast from exile, for each opponent, choose an artifact or land that player controls. destroy the chosen permanents": d => spell(d, [{ op: 'damage', n: 7, who: { all: { types: ['Creature'] } } }, S('meteorExtras')]),
  },
  "Umaro, Raging Yeti": {
    "at the beginning of combat on your turn, choose one at random —\n• other creatures you control get +3/+0 and gain trample until end of turn.\n• discard your hand, then draw four cards.\n• ~ deals 5 damage to any target": d => trig(d, T('beginCombat', [S('umaroRandom')], { pl: 'you', label: 'choose one at random', tslots: [{ who: 'any', opt: true, harm: true }] })),
  },
  "Unfinished Business": {
    "return target creature card from your graveyard to the battlefield, then return up to two target aura and/or equipment cards from your graveyard to the battlefield attached to that creature": d => spell(d, [S('unfinished')], [{ who: 'card', zoneOwner: 'you', f: { types: ['Creature'] } }, { who: 'card', zoneOwner: 'you', opt: true, f: { anyType: ['Enchantment', 'Artifact'] } }, { who: 'card', zoneOwner: 'you', opt: true, f: { anyType: ['Enchantment', 'Artifact'] }, distinct: true }]),
  },
  "Urianger Augurelt": {
    "whenever you play a land from exile or cast a spell from exile, you gain 2 life": d => trig(d, T('cast', [{ op: 'gain', n: 2, pl: 'you' }], { pl: 'you', label: 'gain 2 life' })),
    "draw arcanum — {t}: look at the top card of your library. you may exile it face down": d => abil(d, { label: 'Draw Arcanum', tap: true, effects: [S('uriLook')] }),
    "play arcanum — {t}: until end of turn, you may play cards exiled with ~. spells you cast this way cost {2} less to cast": d => abil(d, { label: 'Play Arcanum', tap: true, effects: [S('uriPlay')] }),
  },
  "Vincent, Vengeful Atoner": {
    "chaos — whenever ~ deals combat damage to an opponent, it deals that much damage to each other opponent if ~'s power is 7 or greater": d => trig(d, T('combatDamagePlayer', [S('vincentChaos')], { subj: 'self', label: 'Chaos' })),
  },
  "Wakka, Devoted Guardian": {
    "whenever ~ deals combat damage to a player, destroy up to one target artifact that player controls and put a +1/+1 counter on ~": d => trig(d, T('combatDamagePlayer', [{ op: 'destroy', who: 't0' }, { op: 'addC', kind: '+1/+1', n: 1, who: 'self' }], { subj: 'self', label: 'destroy an artifact', tslots: [{ who: 'perm', opt: true, f: { types: ['Artifact'] }, harm: true }] })),
  },
  "Wrecking Ball Arm": {
    "equipped creature has base power and toughness 7/7 and can't be blocked by creatures with power 2 or less": d => st(d, { k: 'basePT', who: 'attached', p: 7, t: 7 }, { k: 'cantBeBlockedBy', who: 'attached', f: { types: ['Creature'], powLE: 2 } }),
  },
  "Yuna's Decision": {
    "choose one —\n• continue the pilgrimage — sacrifice a creature. if you do, draw a card, then you may put a creature card and/or a land card from your hand onto the battlefield.\n• find another way — return one or two target permanent cards from your graveyard to your hand": d => { d.spell = { effects: [], modes: { min: 1, max: 1, list: [ { label: 'Continue the Pilgrimage', effects: [S('yunaPilgrim')] }, { label: 'Find Another Way', tslots: [{ who: 'card', zoneOwner: 'you', f: { anyType: ['Artifact','Creature','Enchantment','Land','Planeswalker','Battle'] } }, { who: 'card', zoneOwner: 'you', opt: true, f: { anyType: ['Artifact','Creature','Enchantment','Land','Planeswalker','Battle'] }, distinct: true }], effects: [{ op: 'bounce', who: 't0', dest: 'hand' }, { op: 'bounce', who: 't1', dest: 'hand' }] } ] } }; },
  },
  "Yuna's Whistle": {
    "reveal cards from the top of your library until you reveal a creature card. put that card into your hand and the rest on the bottom of your library in a random order. when you reveal a creature card this way, put x +1/+1 counters on target creature you control, where x is the mana value of that card": d => spell(d, [S('yunaWhistle')], [{ who: 'perm', f: C }]),
  },
  "Zack Fair": {
    "{1}, sacrifice ~: target creature you control gains indestructible until end of turn. put ~'s counters on that creature and attach an equipment that was attached to ~ to that creature": d => abil(d, { label: 'Sacrifice Zack', mana: { generic: 1 }, sac: true, tslots: [{ who: 'perm', f: C }], effects: [{ op: 'grant', who: 't0', kw: ['indestructible'] }, S('zackPass')] }),
  },
  "Summoning Materia": {
    "as long as ~ is attached to a creature, you may cast creature spells from the top of your library": d => st(d, { k: 'topCast', who: 'self', spellF: { types: ['Creature'] } }),
    "equipped creature gets +2/+2 and has vigilance and \"{t}: add {g}.\"": d => st(d, { k: 'pt', who: 'attached', p: 2, t: 2 }, { k: 'kw', who: 'attached', kws: ['vigilance'] }, { k: 'grantMana', who: 'attached', mana: [{ add: ['G'], tap: true }] }),
  },

};
