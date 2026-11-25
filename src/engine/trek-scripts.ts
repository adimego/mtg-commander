/** Exact Oracle patches for Star Trek Commander cards the generic compiler couldn't fully parse. */
import type { CardDef, Effect, TriggerDef, TSlot, TokenSpec, Filter, ActAbility, Static } from './types';

type Patch = (d: CardDef) => void;
const S = (kind: string, extra: Partial<Effect> = {}): Effect => ({ op: 'script', kind, ...extra });
const T = (ev: string, effects: Effect[], extra: Partial<TriggerDef> = {}): TriggerDef => ({ on: 'x', ev, label: extra.label ?? 'trigger', effects, ...extra });
const trig = (d: CardDef, ...ts: TriggerDef[]) => { (d.triggers ??= []).push(...ts); };
const spell = (d: CardDef, effects: Effect[], tslots?: TSlot[]) => { const sp = (d.spell ??= { effects: [] }); sp.effects.push(...effects); if (tslots) sp.tslots = [...(sp.tslots ?? []), ...tslots]; };
const abil = (d: CardDef, a: ActAbility) => { (d.abilities ??= []).push(a); };
const st = (d: CardDef, ...ss: Static[]) => { (d.statics ??= []).push(...ss); };
const YOUR_CREATURES: Filter = { types: ['Creature'], ctrl: 'you' };
const BORG: TokenSpec = { name: 'Borg', p: 1, t: 1, colors: [], types: ['Artifact', 'Creature'], sub: ['Borg'] };
const KLINGON: TokenSpec = { name: 'Klingon Warrior', p: 2, t: 1, colors: ['R'], types: ['Creature'], sub: ['Klingon', 'Warrior'], kws: ['haste'] };
const TRIBBLE: TokenSpec = { name: 'Tribble', p: 1, t: 1, colors: ['W'], types: ['Creature'], sub: ['Tribble'] };
const ART_CREATURE: Filter = { types: ['Artifact', 'Creature'], ctrl: 'you' };
const TY_KW: Filter = { anyType: ['Klingon', 'Warrior'] };

export const TREK_SCRIPTS: Record<string, Record<string, Patch>> = {
  "Alexander, Ship's Fool": { '{t}: each player reveals the top card of their library, then draws a card. ~ deals x damage to a random opponent, where x is the greatest mana value among cards revealed this way': d => abil(d, { label: 'Each player reveals, then draws; deal X to a random opponent', tap: true, effects: [S('alexander')] }) },

  "Ambassador K'Ehleyr": { 'parley — at the beginning of combat on your turn, each player reveals the top card of their library, then draws a card. for each nonland card revealed this way, put a +1/+1 counter on ~': d => trig(d, T('beginCombat', [S('parley')], { pl: 'you', label: 'Parley' })) },

  'Ambulatory Reactor': { 'artifact creatures you control have "{t}: add {c}. spend this mana only to cast an artifact spell or activate an ability of an artifact source."': d => st(d, { k: 'grantMana', who: 'all', f: ART_CREATURE, mana: [{ add: ['C'], tap: true, only: 'artifact' }] }) },

  'Augur of Autumn': { 'coven — as long as you control three or more creatures with different powers, you may cast creature spells from the top of your library': d => { d.covenTopCast = true; } },

  "B'Elanna Torres, Scrapper": { '{2}, {t}: surveil 2, then you may reveal the top card of your library. if an artifact card is revealed this way, draw a card. if you don\'t draw a card this way, put two +1/+1 counters on ~': d => abil(d, { label: 'Surveil 2, then maybe draw an artifact or get counters', mana: { generic: 2 }, tap: true, effects: [{ op: 'surveil', n: 2 }, S('belanna')] }) },

  'Borg Incursion': { 'create two 1/1 colorless borg artifact creature tokens, then artifact creatures you control gain protection from the color until end of turn': d => spell(d, [{ op: 'token', n: 2, tok: BORG }, S('borgIncursion')]) },

  'Captain Kirk, Boldly Going': { 'whenever ~ enters or attacks, search your library and/or graveyard for a basic land card or a card named starship enterprise, reveal it, and put it into your hand. if you search your library this way, shuffle': d => { const fx = [S('kirk')]; trig(d, T('etb', fx, { subj: 'self', label: 'Search for a basic land or Starship Enterprise' }), T('attacks', fx, { subj: 'self', label: 'Search for a basic land or Starship Enterprise' })); } },

  'Chief Montgomery Scott': { 'strange new worlds — {6}, {t}: you may put a creature or spacecraft card from your hand onto the battlefield. it enters with x additional +1/+1 counters on it if it\'s a creature and x additional charge counters on it if it\'s a spacecraft, where x is the number of differently named lands you control': d => abil(d, { label: 'Put a creature or Spacecraft from your hand onto the battlefield', mana: { generic: 6 }, tap: true, effects: [S('scotty')] }) },

  'Chronomantic Escape': { "until your next turn, creatures can't attack you. exile ~ with three time counters on it": d => spell(d, [S('chronoEscape')]) },

  'Cmdr. Troi, Outgoing Empath': { "{t}: target opponent whose turn it is may cast a spell from their hand without paying its mana cost. if they do, you copy that spell. you may choose new targets for the copy. if they don't, you draw a card": d => abil(d, { label: 'Target opponent may cast a spell free; copy it or draw', tap: true, tslots: [{ who: 'opp', harm: false }], effects: [S('troi')] }) },

  'Colossal Clone Master': { 'strange new worlds — you may have ~ enter as a copy of any creature on the battlefield, except it isn\'t legendary and it has "~\'s power and toughness are each equal to the number of differently named lands you control."': d => { d.asEnters = [S('cloneSnw')]; } },

  'Combat Celebrant': { "if ~ hasn't been exerted this turn, you may exert it as it attacks. when you do, untap all other creatures you control and after this phase, there is an additional combat phase": d => { d.celebrant = true; } },

  'Commander Spock': { "strange new worlds — whenever ~ enters or attacks, reveal the top card of your library. you may cast that card without paying its mana cost if that spell's mana value is equal to or less than the number of differently named lands you control. if it's a land card, you may put it onto the battlefield tapped. if that card is still on top of your library, draw a card": d => { const fx = [S('spock')]; trig(d, T('etb', fx, { subj: 'self', label: 'Strange New Worlds' }), T('attacks', fx, { subj: 'self', label: 'Strange New Worlds' })); } },

  'Concerted Effort': { 'at the beginning of each upkeep, creatures you control gain flying until end of turn if a creature you control has flying. the same is true for fear, first strike, double strike, landwalk, protection, trample, and vigilance': d => trig(d, T('upkeep', [S('concerted')], { pl: 'any', label: 'Share keywords' })) },

  'Conquest Mission': { 'whenever a nontoken artifact you control enters, put a quest counter on ~. create a 1/1 colorless borg artifact creature token. if ~ has six or more quest counters on it, create two of those tokens instead': d => trig(d, T('etb', [S('conquest')], { subj: 'any', f: { types: ['Artifact'], ctrl: 'you', nontoken: true }, label: 'Quest counter and Borg' })) },

  'Curzon Dax, Bound by Blood': { 'when ~ dies, you may put a creature card with mana value 3 or less from your hand onto the battlefield': d => trig(d, T('dies', [{ op: 'may', text: 'put a creature card with mana value 3 or less from your hand onto the battlefield', sub: [{ op: 'putLand', f: { types: ['Creature'], mvLE: 3 }, n: 1, text: 'a creature card with mana value 3 or less' }] }], { subj: 'self', label: 'Put a cheap creature from your hand onto the battlefield' })) },

  "Duelist's Heritage": { 'whenever one or more creatures attack, you may have target attacking creature gain double strike until end of turn': d => trig(d, T('youAttack', [{ op: 'may', text: 'target attacking creature gains double strike until end of turn', sub: [{ op: 'grant', who: 't0', kw: ['double strike'] }] }], { pl: 'any', label: 'Grant double strike', tslots: [{ who: 'perm', f: { types: ['Creature'], attacking: true }, harm: false }] })) },

  'Ensign Harry Kim, Operations': {
    'whenever another creature you control enters, if it has greater power than ensign kim, put a +1/+1 counter on ensign kim': d => trig(d, T('etb', [S('harryKim')], { subj: 'other', f: { types: ['Creature'], ctrl: 'you' }, label: 'Counter if the newcomer has greater power' })),
    '{2}, remove two +1/+1 counters from among creatures you control: draw a card': d => abil(d, { label: 'Remove two +1/+1 counters: draw a card', mana: { generic: 2 }, effects: [S('harryRem'), { op: 'draw', n: 1, pl: 'you' }] }),
  },

  'Extraction Integrant': { 'artifact creatures you control have menace and "whenever a creature blocks ~, that creature gets -1/-1 until end of turn."': d => st(d, { k: 'kw', who: 'all', f: ART_CREATURE, kws: ['menace'] }, { k: 'grantAbil', who: 'all', f: ART_CREATURE, grant: { text: 'Whenever a creature blocks ~, that creature gets -1/-1 until end of turn.', triggers: [{ on: 'x', ev: 'blocks', subj: 'any', f: { types: ['Creature'], blockingSrc: true }, label: 'Blocked creature gets -1/-1', effects: [{ op: 'pump', who: 'ev', n: -1, m: -1 }] }] } }) },

  'Ezri Dax, Newly Joined': { "you may have ~ enter as a copy of any creature card in your graveyard that was put there from the battlefield this turn, except her name is ~ and she's a legendary trill in addition to her other types": d => { d.asEnters = [S('ezri')]; } },

  'Fevered Visions': { 'at the beginning of each player\'s end step, that player draws a card. if the player is your opponent and has four or more cards in hand, ~ deals 2 damage to that player': d => trig(d, T('endStep', [S('fevered')], { pl: 'any', label: 'That player draws, maybe 2 damage' })) },

  'Forsaken Monument': { 'whenever you tap a permanent for {c}, add an additional {c}': d => trig(d, T('tappedForMana', [S('extraC')], { pl: 'you', label: 'Add {C}' })) },

  'Fractured Identity': { "exile target nonland permanent. each player other than its controller creates a token that's a copy of it": d => spell(d, [S('fractured')], [{ who: 'perm', f: { notTypes: ['Land'] }, harm: true }]) },

  'Giant Space Amoeba': { "whenever ~ attacks, target creature defending player controls gets -3/-0 until end of turn, then create a token that's a copy of ~": d => trig(d, T('attacks', [{ op: 'pump', who: 't0', n: -3, m: 0 }, { op: 'copyTok', n: 1, who: 'self' }], { subj: 'self', label: 'Weaken a defender and copy itself', tslots: [{ who: 'perm', f: { types: ['Creature'], defP: true }, harm: true }] })) },

  'Grilka, Widowed Warrior': { 'when ~ enters, gain control of target creature an opponent controls until end of turn. untap it. until end of turn, it gains trample, haste, and "whenever ~ deals combat damage to a player, create that many tapped treasure tokens."': d => trig(d, T('etb', [{ op: 'steal', who: 't0', until: 'eot' }, { op: 'untap', who: 't0' }, { op: 'grant', who: 't0', kw: ['trample', 'haste'] }, S('grilkaGrant')], { subj: 'self', label: 'Steal a creature this turn', tslots: [{ who: 'perm', f: { types: ['Creature'], ctrl: 'opp' }, harm: true }] })) },

  'Guardian Project': { "whenever a nontoken creature you control enters, if it doesn't have the same name as another creature you control or a creature card in your graveyard, draw a card": d => trig(d, T('etb', [S('guardian')], { subj: 'any', f: { types: ['Creature'], ctrl: 'you', nontoken: true }, label: 'Draw a card' })) },

  'Guinan, Ancient Advisor': { '{1}, {t}: put a +1/+1 counter on each creature you control that entered this turn. if you put two or more +1/+1 counters on creatures this way, draw a card': d => abil(d, { label: 'Counters on creatures that entered this turn; maybe draw', mana: { generic: 1 }, tap: true, effects: [S('guinan')] }) },

  'Hive Mind Coprocessor': { 'artifact creatures you control have "whenever ~ deals combat damage to a player, you may pay 1 life. if you do, draw a card."': d => st(d, { k: 'grantAbil', who: 'all', f: ART_CREATURE, grant: { text: 'Whenever ~ deals combat damage to a player, you may pay 1 life. If you do, draw a card.', triggers: [{ on: 'x', ev: 'combatDamagePlayer', subj: 'self', label: 'Pay 1 life: draw', effects: [{ op: 'may', text: 'pay 1 life to draw a card', ifPaid: { generic: 0, life: 1 }, sub: [{ op: 'draw', n: 1, pl: 'you' }] }] }] } }) },

  'Hugh, First of Many': { 'artifact spells you cast have replicate {2}{u}': d => { d.hughReplicate = true; } },

  'Janice Rand, Essential Aide': { 'whenever a commander you control enters or attacks, put a +1/+1 counter on it, then reveal cards from the top of your library until you reveal a land card. put that card onto the battlefield tapped and the rest on the bottom of your library in a random order': d => { const fx = [{ op: 'addC', who: 'ev', kind: '+1/+1', n: 1 }, S('randReveal')]; trig(d, T('etb', fx, { subj: 'any', f: { cmdr: 'any', ctrl: 'you' }, label: 'Counter and find a land' }), T('attacks', fx, { subj: 'any', f: { cmdr: 'any', ctrl: 'you' }, label: 'Counter and find a land' })); } },

  "K'Vort-Class Raider": { 'during your turn, ~ and creatures you control have hexproof': d => st(d, { k: 'kw', who: 'all', f: { anyType: ['Creature'], ctrl: 'you' }, kws: ['hexproof'], cond: { k: 'yourTurn' } }, { k: 'kw', who: 'self', kws: ['hexproof'], cond: { k: 'yourTurn' } }) },

  'Kang, Suspicious Captain': {
    'when ~ enters, choose target creature an opponent controls. ~ and that creature are goaded for as long as you control ~': d => trig(d, T('etb', [S('kangGoad')], { subj: 'self', label: 'Goad this and another creature', tslots: [{ who: 'perm', f: { types: ['Creature'], ctrl: 'opp' }, harm: true }] })),
    'whenever one or more goaded creatures attack, put a +1/+1 counter on target creature you control': d => trig(d, T('youAttack', [{ op: 'addC', who: 't0', kind: '+1/+1', n: 1 }], { pl: 'any', label: 'Counter on a creature you control', tslots: [{ who: 'perm', f: YOUR_CREATURES, harm: false }], ifc: { k: 'goadedAttack' } })),
  },

  'Kes, Evolving Telepath': { 'at the beginning of your end step, put a time counter on kes, then draw x cards, where x is the number of time counters on ~. then if ~ has nine or more time counters on ~, sacrifice ~': d => trig(d, T('endStep', [{ op: 'addC', who: 'self', kind: 'time', n: 1 }, { op: 'draw', n: { ctr: 'time', who: 'self' }, pl: 'you' }, { op: 'if', cond: { k: 'ctrGE', n: 9, kind: 'time' }, sub: [{ op: 'sacThis' }] }], { pl: 'you', label: 'Time counter, draw, maybe sacrifice' })) },

  'Koloth, Tribble Hunter': { 'all tribbles get +1/+0 and are goaded': d => { d.koloth = true; st(d, { k: 'pt', who: 'all', f: { anyType: ['Tribble'] }, p: 1, t: 0 }); } },

  'Lieutenant Hikaru Sulu': { 'whenever lieutenant sulu becomes tapped, ~ explores': d => trig(d, T('becomesTapped', [{ op: 'explore', who: 'self' }], { subj: 'self', label: 'Explore' })) },

  'Lieutenant Nyota Uhura': { 'strange new worlds — {4}, {t}: target opponent exiles the top x cards of their library, where x is the number of differently named lands you control. you may cast an instant or sorcery spell from among them without paying its mana cost. then that player puts the rest on the bottom of their library in a random order': d => abil(d, { label: 'Exile the top X of an opponent\'s library; maybe cast an instant or sorcery', mana: { generic: 4 }, tap: true, tslots: [{ who: 'opp', harm: true }], effects: [S('uhura')] }) },

  'Malfunctioning Holodeck': { 'when ~ enters, exile target nonland permanent an opponent controls until ~ leaves the battlefield': d => trig(d, T('etb', [S('ring')], { subj: 'self', label: 'Exile a nonland permanent', tslots: [{ who: 'perm', f: { notTypes: ['Land'], ctrl: 'opp' }, harm: true }] })) },

  'Merciful Mandate': { "untap all creatures you control. if it's a combat phase, you may end the combat phase": d => spell(d, [{ op: 'untap', who: { all: YOUR_CREATURES } }, S('endCombat')]) },

  'Mosswort Bridge': { '{g}, {t}: you may play the exiled card without paying its mana cost if creatures you control have total power 10 or greater': d => abil(d, { label: 'Play the exiled card for free if total power 10+', mana: { generic: 0, G: 1 }, tap: true, effects: [S('mosswort')] }) },

  'One, Borg Evolved': { 'artifact creatures you control have flying, double strike, vigilance, menace, lifelink, and ward {2}': d => st(d, { k: 'kw', who: 'all', f: ART_CREATURE, kws: ['flying', 'double strike', 'vigilance', 'menace', 'lifelink'] }, { k: 'wardN', who: 'all', f: ART_CREATURE, n: 2 }) },

  'Pavel Chekov, First Posting': { 'if you would draw a card, you may instead choose land or nonland and reveal cards from the top of your library until you reveal a card of the chosen kind. put that card into your hand and put all other cards revealed this way on the bottom of your library in a random order': d => { d.chekov = true; } },

  'Planet Killer': { 'whenever ~ deals combat damage to a player, put a +1/+1 counter on it for each land that player controls': d => trig(d, T('combatDamagePlayer', [{ op: 'addC', who: 'self', kind: '+1/+1', n: { count: { types: ['Land'] }, pl: 'evp' } }], { subj: 'self', label: 'Counters for lands' })) },

  "Qo'noS Quartermaster": { "whenever ~ attacks, add one mana of any color. until end of turn, you don't lose this mana as steps and phases end": d => trig(d, T('attacks', [S('qonosMana')], { subj: 'self', label: 'Add mana that lasts the turn' })) },

  "Queen's Diamond": { '{t}: choose a color. add one mana of that color for each charge counter on ~. spend this mana only to cast your commander': d => abil(d, { label: 'Add charge-counter mana of a color (commander only)', tap: true, manaAb: true, effects: [S('queenDiamond')] }) },

  'Reality Shift': { 'exile target creature. its controller manifests the top card of their library': d => spell(d, [{ op: 'exile', who: 't0' }, S('manifestCtl')], [{ who: 'perm', f: { types: ['Creature'] }, harm: true }]) },

  'Reconnaissance Partition': { '{t}, remove a counter from ~: choose one —\n• search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\n• draw a card': d => abil(d, { label: 'Remove a counter: land or draw', tap: true, remC: { kind: '*', n: 1 }, effects: [], modes: { min: 1, max: 1, list: [{ label: 'Search for a basic land, put it onto the battlefield tapped', effects: [{ op: 'search', n: 1, f: { types: ['Land'], basic: true }, dest: 'battlefield', tapped: true, text: 'basic land card' }] }, { label: 'Draw a card', effects: [{ op: 'draw', n: 1, pl: 'you' }] }] } }) },

  'Return to Dust': { 'exile target artifact or enchantment. if you cast ~ during your main phase, you may exile up to one other target artifact or enchantment': d => spell(d, [{ op: 'exile', who: 't0' }, { op: 'if', cond: { k: 'yourMain' }, sub: [{ op: 'may', text: 'exile the other target artifact or enchantment', sub: [{ op: 'exile', who: 't1' }] }] }], [{ who: 'perm', f: { anyType: ['Artifact', 'Enchantment'] }, harm: true }, { who: 'perm', f: { anyType: ['Artifact', 'Enchantment'] }, harm: true, opt: true, distinct: true }]) },

  'Right of Vengeance': { 'until end of turn, whenever a creature deals combat damage to you, destroy that creature and create a 2/1 red klingon warrior creature token with haste': d => spell(d, [S('rightVengeance')]) },

  'S.S. Botany Bay': {
    '{t}: each opponent exiles a card from their graveyard. you may exile a card from your graveyard': d => abil(d, { label: 'Each opponent exiles a card from their graveyard; you may too', tap: true, effects: [S('botanyExile')] }),
    'whenever ~ deals combat damage to a player, return each creature card you own exiled with it to the battlefield': d => trig(d, T('combatDamagePlayer', [S('botanyReturn')], { subj: 'self', label: 'Return exiled creatures' })),
  },

  'Satyr Wayfinder': { 'when ~ enters, reveal the top four cards of your library. you may put a land card from among them into your hand. put the rest into your graveyard': d => trig(d, T('etb', [{ op: 'look', n: 4, take: 1, f: { types: ['Land'] }, dest: 'hand', rest: 'graveyard', text: 'land card' }], { subj: 'self', label: 'Look at the top four' })) },

  'Seven of Nine, Tertiary Adjunct': { 'that is irrelevant — {t}: draw a card, then discard a card. when you discard a nonland card this way, put two charge counters on up to one target artifact': d => abil(d, { label: 'Loot; if you discarded a nonland, two charge counters', tap: true, tslots: [{ who: 'perm', f: { types: ['Artifact'] }, opt: true, harm: false }], effects: [{ op: 'draw', n: 1, pl: 'you' }, { op: 'discard', n: 1, pl: 'you' }, { op: 'if', cond: { k: 'chosenNonland' }, sub: [{ op: 'addC', who: 't0', kind: 'charge', n: 2 }] }] }) },

  'Shared Animosity': { 'whenever a creature you control attacks, it gets +1/+0 until end of turn for each other attacking creature that shares a creature type with it': d => trig(d, T('attacks', [S('animosity')], { subj: 'any', f: { types: ['Creature'], ctrl: 'you' }, label: 'Typal attack pump' })) },

  'Shore Leave Planet': { "{4}{u}: ~ becomes a copy of target creature you control until end of turn, except it isn't legendary and it's a robot artifact in addition to its other types": d => abil(d, { label: 'Become a copy until end of turn', mana: { generic: 4, U: 1 }, tslots: [{ who: 'perm', f: YOUR_CREATURES, harm: false }], effects: [S('shoreLeave')] }) },

  'Shuttlecraft Galileo': { 'whenever ~ attacks, up to seven target attacking creatures gain flying until end of turn': d => trig(d, T('attacks', [S('galileo')], { subj: 'self', label: 'Up to seven attacking creatures gain flying', tslots: Array.from({ length: 7 }, () => ({ who: 'perm' as const, f: { types: ['Creature'], attacking: true }, opt: true, harm: false, grp: 1 })) })) },

  'Sins of the Father': { "iii — exile target player's graveyard. each opponent loses life equal to the number of creature cards exiled this way": d => trig(d, T('chapter', [S('sins')], { subj: 'self', ifc: { k: 'evAmt', n: 3 }, label: 'Chapter III', tslots: [{ who: 'player', harm: true }] })) },

  'Starfleet Communicator': { 'equipped creature has "whenever ~ attacks, draw x cards, then you may put up to x land cards from your hand onto the battlefield tapped, where x is the number of other creatures you control with a communicator attached to them."': d => st(d, { k: 'grantAbil', who: 'attached', grant: { text: 'Whenever ~ attacks, draw X, then you may put lands.', triggers: [{ on: 'x', ev: 'attacks', subj: 'self', label: 'Draw X and put lands', effects: [S('communicator')] }] } }) },

  'Stonespeaker Crystal': { "{2}, {t}, sacrifice ~: exile any number of target players' graveyards. draw a card": d => abil(d, { label: "Exile any number of players' graveyards; draw", mana: { generic: 2 }, tap: true, sac: true, tslots: [{ who: 'player', opt: true, harm: true, grp: 1 }, { who: 'player', opt: true, harm: true, grp: 1 }, { who: 'player', opt: true, harm: true, grp: 1 }, { who: 'player', opt: true, harm: true, grp: 1 }], effects: [S('stonespeaker'), { op: 'draw', n: 1, pl: 'you' }] }) },

  'Sword of Light and Shadow': { 'equipped creature gets +2/+2 and has protection from white and from black': d => st(d, { k: 'pt', who: 'attached', p: 2, t: 2 }, { k: 'kw', who: 'attached', kws: ['protection from white', 'protection from black'] }) },

  "T'Pring, Never Parted": { 'kal-if-fee — when ~ enters, choose another target creature you control and target creature an opponent controls. you may have the chosen creatures fight each other. whenever a creature that fought this way dies this turn, you draw a card': d => trig(d, T('etb', [S('tpring')], { subj: 'self', label: 'Kal-if-fee', tslots: [{ who: 'perm', f: { types: ['Creature'], ctrl: 'you', other: true }, harm: false }, { who: 'perm', f: { types: ['Creature'], ctrl: 'opp' }, harm: true }] })) },

  'Temporal Tribulation': { "exile two target permanents you control. return those cards to the battlefield under their owner's control at the beginning of the next end step": d => spell(d, [{ op: 'flicker', who: 't0', ret: 'eot' }, { op: 'flicker', who: 't1', ret: 'eot' }], [{ who: 'perm', f: { ctrl: 'you' }, harm: false, grp: 1 }, { who: 'perm', f: { ctrl: 'you' }, harm: false, grp: 1 }]) },

  'The Promise of Kahless': { 'you may sacrifice a klingon or warrior. if you do, return all other klingon and warrior creature cards from your graveyard to the battlefield': d => spell(d, [{ op: 'may', text: 'sacrifice a Klingon or Warrior', sub: [{ op: 'sac', n: 1, pl: 'you', f: TY_KW, text: 'Klingon or Warrior' }, S('kahlessPromise')] }]) },

  'The Sword of Kahless': { 'equipped creature gets +2/+2 and has "whenever ~ attacks, look at the top five cards of your library. you may put a klingon or warrior creature card from among them onto the battlefield. put the rest on the bottom of your library in a random order."': d => st(d, { k: 'pt', who: 'attached', p: 2, t: 2 }, { k: 'grantAbil', who: 'attached', grant: { text: 'Whenever ~ attacks, look at the top five.', triggers: [{ on: 'x', ev: 'attacks', subj: 'self', label: 'Find a Klingon or Warrior', effects: [{ op: 'look', n: 5, take: 1, f: { types: ['Creature'], anyType: ['Klingon', 'Warrior'] }, dest: 'battlefield', rest: 'bottom', text: 'Klingon or Warrior creature card' }] }] } }) },

  'Transwarp Hub': { 'when ~ enters, mill five cards. you may put up to two artifact cards from among them into your hand': d => trig(d, T('etb', [{ op: 'mill', n: 5, pl: 'you' }, S('transwarp')], { subj: 'self', label: 'Mill five; maybe take artifacts' })) },

  'Tribble Cluster': { 'when ~ dies, create x 1/1 white tribble creature tokens with "~ can\'t block," where x is ~\'s power': d => trig(d, T('dies', [S('tribbleCluster')], { subj: 'self', label: 'Create Tribbles' })) },

  'Tuvok, Chief Tactical Officer': { 'when ~ enters during the declare attackers step, choose up to two target attacking creatures. for each of them, you may reselect which player or permanent that creature is attacking': d => trig(d, T('etb', [S('tuvok')], { subj: 'self', ifc: { k: 'attackersStep' }, label: 'Reselect attackers', tslots: [{ who: 'perm', f: { types: ['Creature'], attacking: true }, opt: true, harm: false, grp: 1 }, { who: 'perm', f: { types: ['Creature'], attacking: true }, opt: true, harm: false, grp: 1 }] })) },

  'U.S.S. Defiant, Mirror Migrant': { 'when ~ enters, it and up to one target creature you control phase out': d => trig(d, T('etb', [S('phaseT'), { op: 'script', kind: 'phaseSelf' }], { subj: 'self', label: 'Phase out', tslots: [{ who: 'perm', f: YOUR_CREATURES, opt: true, harm: false }] })) },

  'U.S.S. Enterprise-C, Time-Tossed': { 'when ~ enters or dies, you may discard your hand. if you do, draw a card for each card discarded this way': d => { const fx = [{ op: 'may', text: 'discard your hand, then draw that many cards', sub: [{ op: 'discard', n: 99, pl: 'you' }, { op: 'draw', n: 'chosen', pl: 'you' }] }]; trig(d, T('etb', fx, { subj: 'self', label: 'Cycle your hand' }), T('dies', fx, { subj: 'self', label: 'Cycle your hand' })); } },

  'U.S.S. Farragut, Bold Explorer': { 'landfall — whenever a land you control enters, you may put a creature card from your hand onto the battlefield. that creature gains haste. at the beginning of the next end step, put it on the bottom of your library. when you do, draw a card': d => trig(d, T('etb', [S('farragut')], { subj: 'any', f: { types: ['Land'], ctrl: 'you' }, label: 'Put a creature from your hand' })) },

  'U.S.S. Prometheus, Prototype': { '8+ | multivector assault mode — whenever ~ deals combat damage to an opponent, it deals that much damage to each other opponent': d => trig(d, T('combatDamagePlayer', [S('prometheus')], { subj: 'self', pl: 'notyou', ifc: { k: 'ctrGE', kind: 'charge', n: 8 }, label: 'Damage each other opponent' })) },

  'Unification': {
    'i — the owner of up to one target creature draws two cards, then shuffles that creature into their library': d => trig(d, T('chapter', [S('unificationI')], { subj: 'self', ifc: { k: 'evAmt', n: 1 }, label: 'Chapter I', tslots: [{ who: 'perm', f: { types: ['Creature'] }, opt: true, harm: true }] })),
    'ii — you may put a spacecraft card from your hand or graveyard onto the battlefield': d => trig(d, T('chapter', [S('unificationII')], { subj: 'self', ifc: { k: 'evAmt', n: 2 }, label: 'Chapter II' })),
  },

  'Voq, Torchbearer': { "choh'a' — you may have voq enter as a copy of a creature card in a graveyard, except he's a klingon spy in addition to his other types and has menace": d => { d.asEnters = [S('voq')]; } },

  'Võx, Child of the Collective': { 'when võx enters and at the beginning of your first main phase, the next artifact creature spell and the next spacecraft spell you cast this turn have undaunted': d => { const fx = [S('voxUndaunted')]; trig(d, T('etb', fx, { subj: 'self', label: 'Undaunted' }), T('firstMain', fx, { pl: 'you', label: 'Undaunted' })); } },
};
