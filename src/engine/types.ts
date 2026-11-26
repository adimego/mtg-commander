// Shared engine types. The data-driven ability system: compiled Oracle text and hand-written card data both produce these.
export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
/** A mana unit; 'W|U' means one mana of either color (dual lands). */
export type ManaSym = Color | 'C' | 'ANY' | 'IDENTITY' | 'OPP' | 'LEGEND' | 'MINE' | 'CHOSEN' | `${string}|${string}`;
export const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];
/** Mana cost. `x` = number of {X}; `hyb` = hybrid units like 'W|U' or '2|W'; `phy` = Phyrexian colored symbols (pay color or 2 life). */
export interface Cost { generic: number; W?: number; U?: number; B?: number; R?: number; G?: number; C?: number; x?: number; hyb?: string[]; phy?: Color[]; life?: number; /** energy counters to pay */ E?: number }
/** Legacy target specs (hand-written cards). */
export type TargetSpec = 'any' | 'creature' | 'oppCreature' | 'tappedCreature' | 'nonblackCreature' | 'nonartifactCreature' | 'spell' | 'noncreatureSpell' | 'creatureSpell';

/** Object filter for permanents / cards / spells. Types match card types or subtypes. */
export interface Filter {
  types?: string[]; anyType?: string[]; notTypes?: string[]; ctrl?: 'you' | 'opp';
  colors?: Color[]; notColors?: Color[]; colorless?: boolean; multicolor?: boolean;
  tapped?: boolean; untapped?: boolean; other?: boolean; token?: boolean; nontoken?: boolean;
  powLE?: number; powGE?: number; mvLE?: number; mvGE?: number; attacking?: boolean; blocking?: boolean; atkOrBlk?: boolean; attackedT?: boolean;
  legendary?: boolean; nonlegendary?: boolean; basic?: boolean; nonbasic?: boolean; kw?: string; noKw?: string; name?: string; notName?: string;
  /** mana cost contains at least one mana symbol of this color (hybrid and Phyrexian count) */ pip?: Color;
  /** one or more colors */ colored?: boolean; monocolor?: boolean; /** has a counter of this kind */ ctr?: string; /** mana value <= / == the ability's X */ mvLEX?: boolean; mvEqX?: boolean; /** of / not of the source's chosen creature type */ chosenType?: boolean; notChosenType?: boolean; touGE?: number; touLE?: number; /** a commander ('own': one the evaluating player owns) */ cmdr?: 'any' | 'own'; /** controlled by the player the source is attacking */ defP?: boolean; /** has counters or an Equipment / own Aura attached */ modified?: boolean; /** mana value <= the source's power */ mvLEPow?: boolean; goaded?: boolean; /** blocking the source */ blockingSrc?: boolean; /** shares the source's chosen color */ chosenColor?: boolean; /** power less than the source's power */ powLTSrc?: boolean; /** controller is the player in target slot N (resolved at effect time) */ ctrlT?: number; /** put into this zone from the battlefield this turn */ fromBfT?: boolean; /** has any counter */ anyCtr?: boolean; fromHand?: boolean; hasX?: boolean; attachedToYours?: boolean;
}
/** One target slot. who: perm = permanent on battlefield; any = creature/planeswalker/player; player/opp = players; spell / ability = on the stack; card = card in a graveyard. */
export interface TSlot { /** only usable when the source was kicked more than this many times (Batroc: 'up to X targets') */ xIdx?: number; who: 'perm' | 'any' | 'player' | 'opp' | 'spell' | 'ability' | 'card' | 'stack' | 'spellOrC'; f?: Filter; zoneOwner?: 'you' | 'opp' | 'any'; opt?: boolean; harm?: boolean; label?: string; same?: number; /** slots made by one 'target' word (e.g. 'two target creatures') share a group: they need different objects */ grp?: number; /** 'another target …' after an earlier target: must differ from every earlier target */ distinct?: boolean; /** 'for each opponent, … target … that player controls': controlled by the controller's Nth opponent */ oppIdx?: number; /** spell or ability must currently have exactly one target */ single?: boolean; /** must share a creature type with the target already chosen for this slot index */ shareType?: number; /** slot i is legal only when this amount (evaluated now) is greater than xIdx */ xAmt?: Amt }
export type Amt = number | string | { maxPow: Filter } | { count: Filter; zone?: 'battlefield' | 'graveyard'; pl?: PRef } | { pow: Ref } | { tough: Ref } | { mv: Ref } | { cards: 'hand' | 'graveyard' | 'library'; pl: PRef; f?: Filter } | { life: PRef } | { mul: number; of: Amt } | { plus: number; of: Amt } | { ctr: string; who: Ref } | { half: Amt } | { devotion: Color[] } | { opps: true } | { lifeLost: true } | { lostWay: true } | { lifeGained: true } | { mvSum: Filter } | { colorsOf: Ref } | { ffColors: true } | { mvMaxNC: true } | { pips: Color } | { etbN: true } | { oppCowards: true } | { typeShare: true } | { pool: true } | { atkOpps: true } | { uniqLands: true } | { mvMaxCmd: true } | { spentCols: true } | { diedYou: true } | { powSum: Filter } | { aurasOnIt: true } | { aurasOnYours: true } | { cmdCasts: true } | { permColors: true } | { sum: Amt[] } | { domain: true } | { gyTypes: true } | { gyTypesAll: true } | { energy: true } | { maxMv: Filter } | { maxOppHand: true };
/** Reference to objects: self, ev (event card), t0..tN (targets), created, chosen, attached (what the source is attached to), host, all:filter. */
export type Ref = string | { all: Filter; zone?: 'graveyard' };
/** Player reference: you, opps, all, evp (event player), tctl (controller of target 0), t0 (player target slot 0), ctl:tN, def (defending), owner:tN. */
export type PRef = string;
export interface Cond {
  k: 'atkMonarch' | 'cmdrAttacking' | 'evByYou' | 'attackedLastTurn' | 'atkMoreLife' | 'subjAtkMonarchOpp' | 'evAtkMonarch' | 'yourTurnPreAtk' | 'srcDamagedEv' | 'ctrCross' | 'discardedThisTurn' | 'ctlCommander' | 'monstrous' | 'yourTurn' | 'notYourTurn' | 'control' | 'controlNo' | 'lifeGE' | 'lifeLE' | 'kicked' | 'handLE' | 'handGE' | 'gyGE' | 'oppControlsMore' | 'attacking' | 'tapped' | 'untapped' | 'evCtlYou' | 'evCtlOpp' | 'evIs' | 'xGE' | 'lifeGainedThisTurn' | 'cardsInGyGE' | 'noCardsHand' | 'manaSpent' | 'oppLifeLE' | 'gotCounters' | 'creatureDiedThisTurn' | 'descended' | 'oppsGE' | 'not' | 'enteredThisTurn' | 'prepared' | 'ctrGE' | 'maxSpeed' | 'void' | 'saddled' | 'oppLandsGE' | 'incr' | 'spentGE' | 'leftYours' | 'enduring' | 'chosenNonland' | 'teamwork' | 'evAmt' | 'evAmtGE' | 'enteredUntapped' | 'ctrIn' | 'ctrEq' | 'sneakPaid' | 'webSlung' | 'libEmpty' | 'attachedCreature' | 'refIs' | 'castNoncThisTurn' | 'oppCastThisTurn' | 'monarch' | 'noMonarch' | 'handHas' | 'otherLandsLE' | 'yourUpkeep' | 'atkMeGE' | 'wasCast' | 'yourMain' | 'atkGE' | 'oppPoisonGE' | 'toughSumGE' | 'attackedThisTurn' | 'createdTokenThisTurn' | 'evPowGE' | 'doorOpen' | 'coven' | 'goadedAttack' | 'attackersStep' | 'firstLoseLife' | 'anyHandLE' | 'modDiedYou' | 'blessing' | 'leftGyYou' | 'evVsYou' | 'evVsOpp' | 'lostLifeGE' | 'evolve' | 'noP1P1' | 'firstCombat' | 'gotCtrSelf' | 'putCtrYou' | 'oppGyGE' | 'atkMostLife' | 'giftPromised' | 'celebration' | 'delirium' | 'formidable' | 'packTactics' | 'evSpellYou' | 'battalion' | 'spellMastery' | 'powSumGE' | 'notRenowned' | 'offspringPaid' | 'training' | 'bargained' | 'tributeUnpaid' | 'anyLifeLE' | 'tgtTappedCreature';
  f?: Filter; n?: number; max?: number; ref?: Ref; c?: Cond; kind?: string;
}
export interface TokenSpec { name: string; p?: number; t?: number; colors: Color[]; types: string[]; sub?: string[]; kws?: string[]; legendary?: boolean; /** compiled quoted abilities (\"{t}: add {g}.\") */ ext?: Pick<CardDef, 'text' | 'mana' | 'abilities' | 'triggers' | 'statics' | 'keywords'>; preset?: 'Lander' | 'Heartwood' | 'Treasure' | 'Food' | 'Clue' | 'Blood' | 'Map' | 'Gold' | 'Powerstone' | 'Vibranium'; /** printed mana value (Gingerbrute is a {1} token) */ mv?: number }
export interface Effect {
  op: string; n?: Amt; m?: Amt; toHand?: boolean;
  who?: Ref; pl?: PRef; f?: Filter; kw?: string[]; kind?: string; tok?: TokenSpec; dest?: 'hand' | 'battlefield' | 'top' | 'bottom' | 'graveyard' | 'exile';
  tapped?: boolean; attacking?: boolean; sub?: Effect[]; cond?: Cond; text?: string; mana?: string[]; rest?: 'bottom' | 'graveyard' | 'top' | 'hand' | 'exile'; take?: Amt; eot?: boolean; random?: boolean; upTo?: boolean;
  zone?: 'graveyard' | 'library' | 'hand' | 'battlefield' | 'exile' | 'handOrGy'; reveal?: boolean; sh?: boolean; other?: Ref; until?: 'eot' | 'yourNext' | 'perm'; ctl?: PRef; ret?: 'eot' | 'now' | 'ownerEnd'; ifPaid?: Cost; /** continuous effect fields (op 'becomes') */ ce?: CEFx; /** reflexive trigger (op 'reflex') */ rt?: { effects: Effect[]; tslots?: TSlot[]; label: string }; free?: boolean; /** emblem definition (op 'emblem') */ emb?: CardDef; /** 'if' otherwise-branch ("... instead") */ else?: Effect[];
}
export interface ManaAbility { /** spend restriction: artifact | hero | villain | ctypeSpell | ctypeAny | legendary */ only?: string; add: ManaSym[]; sac?: boolean; n?: Amt; cost?: Cost; tap?: boolean; /** damage dealt to you when tapped for colored mana (painlands) */ pain?: number; door?: number; /** this land doesn't untap during your next untap step after used */ skipNextUntap?: boolean }
export interface ActAbility { /** waterbend: up to N generic paid by tapping artifacts/creatures */ wb?: number;
  label: string; tap?: boolean; untap?: boolean; mana?: Cost; sac?: boolean; target?: TargetSpec; effects: Effect[];
  tslots?: TSlot[]; sacF?: { f: Filter; n: number; other?: boolean }; discard?: number; discardRandom?: boolean; life?: number; remC?: { kind: string; n: number }; addC?: { kind: string; n: number };
  exileGy?: { f?: Filter; n: number; self?: boolean }; tapF?: { f: Filter; n: number }; /** Morph: turn this face-down permanent face up. A special action; it doesn't use the stack. */ morphTurn?: boolean; /** Crew N: tap untapped creatures with total power N or more */ crew?: number; /** Station: tap another creature, put charge counters equal to its power */ station?: boolean; loyalty?: number; /** -X loyalty: X chosen on activation */ loyX?: boolean; sorcery?: boolean; forecast?: boolean; zone?: 'hand' | 'graveyard'; equip?: boolean; once?: boolean; /** only opponents may activate this */ oppOnly?: boolean; exileSelf?: boolean; returnSelf?: boolean; reveal?: boolean; modes?: Modes; xFromMana?: boolean; cond?: Cond; manaAb?: boolean; /** Room: this ability only functions while this door is unlocked */ door?: number;
}
export interface Modes { /** escalate — tap an untapped creature you control per extra mode */ escalate?: boolean; /** Escalate {M}: pay this cost for each mode beyond the first */ escalateCost?: Cost; /** 'you may choose the same mode more than once' */ repeat?: boolean; min: number; max: number; /** 'choose both instead' when this holds as you cast */ bothIf?: Cond; list: { label: string; tslots?: TSlot[]; effects: Effect[] }[] }
export interface TriggerDef {
  on: string; filter?: string; cond?: string; target?: TargetSpec; label: string; effects: Effect[]; /** works while the card is in its owner's graveyard */ gy?: boolean; /** 'one or more': at most once per batch (one effect / event group) */ batch?: boolean;
  // compiled triggers (on === 'x')
  ev?: string; subj?: 'self' | 'other' | 'any' | 'attached'; f?: Filter; pl?: 'you' | 'opp' | 'any' | 'notyou'; tslots?: TSlot[]; ifc?: Cond; modes?: Modes; /** Room door index required to be unlocked */ door?: number; kindF?: string; zoneFrom?: string; once?: boolean; combat?: boolean; /** 'your second card each turn' (draw), 'first noncreature spell each turn' */ nth?: { k: 'draw' | 'n' | 'nonc' | 'isv' | 'x'; n: number }; mvGE?: number;
}
export interface Static { k: 'asThoughWither' | 'noLifeGainAll' | 'flashIfTapped' | 'flashIfOppCast' | 'ramonda' | 'propaganda' | 'atkMostLife' | 'angelTokens' | 'noLegendRule' | 'pt' | 'kw' | 'goad' | 'cantBlock' | 'cantAttack' | 'costLess' | 'costMore' | 'unblockable' | 'mustAttack' | 'noMaxHand' | 'cantBeBlockedBy' | 'doesntUntap' | 'playerHexproof' | 'drawLimit' | 'oppsSorcery' | 'noSearch' | 'winOnEmptyDraw' | 'tokenDouble' | 'tokenTriple' | 'pwInstant' | 'manaExtra' | 'cantBeAttacked' | 'atkLimit1' | 'etbExtra' | 'grantMana' | 'dmgPlus1' | 'dmgPlusCtr' | 'preventToAttachedCtr' | 'preventOppToYou' | 'preventAttackers' | 'basePT' | 'wardN' | 'wardLifeN' | 'areIsland' | 'omni' | 'topLook' | 'topCast' | 'taxSpell' | 'taxAct' | 'pipLess' | 'soulDraw' | 'devotionNotCreature' | 'convokeSpells' | 'oppsCantCast' | 'spellsUncounterable' | 'noSacWarriors' | 'cowardBlock' | 'noGameEnd' | 'noLifeGain' | 'noMinus' | 'manaPersist' | 'toxicLink' | 'noPrevent' | 'noCounter' | 'grantAbil' | 'topPlayLand' | 'doubleLife' | 'doubleDraw' | 'plusCharge' | 'plusP1P1' | 'lifePlus1' | 'addSub' | 'cantAtkYou' | 'taxAtkCtr' | 'oppUntapCreatures' | 'darksteel' | 'noLoyalty' | 'oppUntapArts' | 'extraC' | 'etbTappedOpp' | 'improviseSpells' | 'loseKw' | 'equip0Metalcraft' | 'secondSpellLess' | 'landsUntapped' | 'prolifTwice' | 'flashSpell' | 'manaPersistColor' | 'etbTypalCtr' | 'blockMax1' | 'controlAttached' | 'blockOnlyBy' | 'blockMin2' | 'goadedCantBlock' | 'cantActivate' | 'extraBlock' | 'mustBlock'; add?: string[]; mana?: ManaAbility[]; who: 'self' | 'attached' | 'others' | 'all'; f?: Filter; p?: number | Amt; t?: number | Amt; kws?: string[]; n?: number; spellF?: Filter; cond?: Cond; door?: number; grant?: Pick<CardDef, 'mana' | 'abilities' | 'triggers' | 'statics'> & { text?: string }; /** pipLess: the color that is reduced, then generic (CR 118.7c) */ color?: Color; /** devotion colors, or the counter kind for dmgPlusCtr */ colors?: Color[]; ctrKind?: string; fromNotHand?: boolean; firstX?: boolean; tgtCreature?: boolean; eriette?: boolean }
export interface RoomDoor { name: string; cost: Cost; text?: string; triggers?: TriggerDef[]; abilities?: ActAbility[]; statics?: Static[]; mana?: ManaAbility[]; keywords?: string[]; img?: string; art?: string }
export interface CardDef {
  /** 'If you control a commander, you may cast this spell without paying its mana cost.' */
  freeCmdr?: boolean;
  /** Surge: alternative cost if you have cast another spell this turn. */ surge?: Cost;
  /** Champion a [subtype]. */ champion?: string;
  /** Soulbond pairing triggers. */ soulbond?: boolean;
  /** Additional cost: sacrifice a permanent matching sacF, or pay `pay` generic mana. */ costOr?: { sacF: { f: Filter; n: number }; pay: number };
  /** Aboleth Spawn: copy ETB triggers of creatures entering under an opponent's control. */ copyOppEtb?: boolean; /** Molecule Man: nonland cards in your hand have miracle {0} */ miracle0?: boolean; /** Annie Joins Up: triggered abilities of your legendary creatures trigger an additional time */ legendTrigTwice?: boolean; /** Isshin: attack-caused triggers of your permanents trigger an additional time */ attackTrigTwice?: boolean; /** Roaming Throne: triggers of another creature of the chosen type trigger an additional time */ typeTrigTwice?: boolean; /** Conduit of Worlds */ landsFromGy?: boolean; /** Dragon Man: may be cast from your graveyard by discarding a card */ gyDiscard?: boolean; /** Coveted Jewel */ jewel?: boolean; /** Marvin: has the activated abilities of other uniquely-named creatures you control */ copyActs?: boolean;
  /** Ward — pay N life. */ wardLife?: number; /** pay `life` life, or `pay` generic mana instead */ costOrLife?: { life: number; pay: number }; /** exile N cards of one color from hand rather than pay mana */ exileAlt?: { n: number; color: Color }; /** equip costs {1} less for each color of the targeted creature */ equipColorLess?: boolean; /** tiered spell: additional cost of the chosen mode (index-aligned with modes) */ tierCosts?: Cost[]; /** Thriving land: {T} adds this color or the chosen color */ colorMana?: Color; /** Mirrormind Crown replacement while attached */ crown?: boolean;
  id: string; name: string; types: string[]; legendary?: boolean; basic?: boolean; cost: Cost; colors: Color[]; power?: number; toughness?: number;
  keywords?: string[]; text: string; typeLine?: string; img?: string; art?: string; sub?: string[];
  mana?: ManaAbility[]; abilities?: ActAbility[]; triggers?: TriggerDef[]; spell?: { target?: TargetSpec; effects: Effect[]; tslots?: TSlot[]; modes?: Modes };
  static?: { p: number; t: number; others?: boolean }; statics?: Static[]; mustAttack?: boolean; uncounterable?: boolean;
  /** Enters the battlefield tapped. */ etbTapped?: boolean;
  /** Set for imported cards whose rules text is not (fully) modelled: explains what the game does with it. */ limited?: string;
  /** Scryfall color identity (imported cards); overrides the computed one. */ identity?: Color[];
  kicker?: Cost; flashback?: Cost; flashbackLife?: number; /** overload: alternative cost; "target" becomes "each" */ overload?: { cost: Cost; spell?: CardDef['spell'] }; ward?: number; loyalty?: number; aura?: TSlot; convoke?: boolean; etbCounters?: { kind: string; n: Amt }; token?: boolean;
  /** "Partner" / "Choose a Background" etc.: can be one of two commanders. */ partner?: boolean; canBeCommander?: boolean;
  /** 'As this enters, choose a creature type.' */ chooseType?: boolean; /** Rebound (rule 702.88) */ rebound?: boolean; /** '~ is the chosen type in addition to its other types' */ addChosen?: boolean;
  /** Shockland: may pay this much life to enter untapped. */ shock?: number; /** Enters tapped unless the condition holds. */ etbTappedUnless?: Cond;
  /** multikicker {N}: modelled as N X-symbols, X = times kicked */ multikicker?: number;
  /** replacement steps run as this permanent spell resolves, before it enters (clones: "you may have ~ enter as a copy") */ asEnters?: Effect[];
  /** "costs {1} less to cast for each ..." */ selfCostLess?: { n: number; per: Amt }; /** costs {n} less if cond */ costLessIf?: { n: number; cond: Cond };
  /** Additional casting costs. */ extraCost?: { sacF?: { f: Filter; n: number }; discard?: number; life?: number; lifeX?: boolean; sacX?: boolean; blight?: number };
  /** Prepare cards: enters prepared; the prepare spell (back face) whose copy may be cast while prepared. */ etbPrepared?: boolean; /** Saga: final chapter number */ saga?: number; /** double-faced / adventure: the other face */ back?: CardDef; /** modal DFC: the back face may be cast/played */ mdfc?: boolean; /** this face is an Adventure */ adventure?: boolean; /** split card (either or both halves may be cast) */ split?: boolean; /** Fuse: both halves may be cast together from hand */ fuse?: boolean; /** Aftermath: this face (usually the back) is only castable from the graveyard, then exiled */ aftermath?: boolean; /** Kamigawa-style flip card: the back face is reached by flipping in place */ flip?: boolean; /** foretell cost */ foretell?: Cost; /** Ninjutsu cost (activated from hand during declare blockers) */ ninjutsu?: Cost; /** Improvise: tap artifacts to help pay generic */ improvise?: boolean; /** Evolve keyword */ evolve?: boolean; evoke?: Cost; mayhem?: Cost; harmonize?: Cost; webSling?: Cost; prepDef?: CardDef; /** Spacecraft: artifact creature at this many charge counters */ stationAt?: number; /** Sneak cost */ sneak?: Cost; /** Teamwork N (optional additional cost) */ teamwork?: number; /** Storied */ storied?: boolean; /** Warp cost */ warp?: Cost; /** Start your engines! */ engines?: boolean;
  /** 'As this enters, choose a color.' */ chooseColor?: boolean;
  /** Squad {cost}: pay any number of times on ETB, create that many copies. */ squad?: Cost;
  /** Hideaway N */ hideaway?: number;
  /** Suspend N—cost */ suspend?: { n: number; cost: Cost };
  delve?: boolean; retrace?: boolean; livingWeapon?: boolean; echo?: Cost; ascend?: boolean; gyHaste?: boolean; trigTwice?: 'shamanWizard' | 'veyran'; oppUntapC?: boolean; devour?: number; backup?: number; escape?: { cost: Cost; n: number }; escapeCtr?: { kind: string; n: Amt }; bestow?: Cost; strive?: boolean;
  /** additional cost: discard a card or pay N life */ discardOrLife?: { life: number; discard: number };
  /** land ETB triggers of permanents you control trigger an additional time */ landTrigTwice?: boolean;
  /** Yarok: ETB-caused triggers of permanents you control trigger an additional time */ permTrigTwice?: boolean;
  /** Ward — Blight N */ wardBlight?: number;
  /** you may blight N as an additional cost */ optBlight?: number;
  /** Elemental permanent spells you cast from hand gain this evoke cost */ grantEvokeElem?: Cost;
  /** evoke by exiling a card of this color from hand */ evokeExile?: Color;
  /** Muldrotha: play a land and one permanent of each type from your graveyard each turn */ muldrotha?: boolean;
  /** Augur of Autumn coven: cast creature spells from the top if 3+ different powers */ covenTopCast?: boolean;
  /** Combat Celebrant: may exert as it attacks for an extra combat */ celebrant?: boolean;
  /** Pavel Chekov: replacement on draws */ chekov?: boolean;
  /** Koloth: all Tribbles are goaded */ koloth?: boolean;
  /** Hugh, First of Many: artifact spells you cast have replicate {2}{U} */ hughReplicate?: boolean;
  /** Dredge N */ dredge?: number;
  /** Sunburst: ETB +1/+1 (creature) or charge counters equal to colors of mana spent */ sunburst?: boolean;
  /** State trigger: you win if this has this many charge counters */ winAtCharge?: number;
  /** Once a turn, cast a permanent from GY by sacrificing a land */ broodship?: boolean;
  /** Gift a card (promise as you cast; chosen opponent draws as it resolves). */ gift?: 'card';
  /** Escalate {M} cost, copied onto spell.modes after modes parse. */ escalateCost?: Cost;
  /** Dethrone: +1/+1 when attacking the player with the most life. */ dethrone?: boolean;
  /** Kalitas: opponent nontoken creatures are exiled if they would die. */ kalitas?: boolean;
  /** Imprint: cards this exiles are tagged exBy for later. */ imprint?: boolean;
  /** Saga: choose a chapter and start with that many lore counters. */ readAhead?: boolean;
  /** Cast this from your graveyard if you control this typal (Gravecrawler). */ gyCast?: 'zombie';
  /** Sephara alternative cost: {W} and tap four fliers. */ sepharaAlt?: boolean;
  /** First/second/third turn restriction (Serra Avenger). */ noCastTurns?: number; /** Begin the game with this in play if it is in your opening hand. */ leyline?: boolean; /** Timing restriction on casting this spell. */ castOnly?: 'declareAttackers' | 'afterOppUpkeep'; /** Can't attack unless the defending player controls a matching permanent. */ atkUnlessDef?: Filter; /** Bloodthirst N */ bloodthirst?: number; modular?: number; graft?: number; fabricate?: number; amplify?: number; dash?: Cost; offspring?: Cost; extort?: boolean; unleash?: boolean; forMirrodin?: boolean; buyback?: Cost; jumpStart?: boolean; madness?: Cost; miracle?: Cost; entwine?: Cost; conspire?: boolean; assist?: boolean; soulshift?: number; bargain?: boolean; exploit?: boolean; splitSecond?: boolean; storm?: boolean; casualty?: number; spectacle?: Cost; blitz?: Cost; freerunning?: Cost; emerge?: Cost; recover?: Cost; transmute?: Cost; tribute?: number; splice?: { onto: string; cost: Cost }; wardDiscard?: number; wardExileGy?: number; wardSac?: Filter; partnerWith?: string; partnerKind?: 'partner' | 'partnerWith' | 'friendsForever' | 'chooseBackground' | 'doctorsCompanion';


  /** Riot: ETB choose a +1/+1 counter or haste. */ riot?: boolean;
  /** Mentor: on attack, +1/+1 on target attacking creature with lesser power. */ mentor?: boolean;
  /** Encore cost (activated from the graveyard). */ encore?: Cost;
  /** Replicate cost (paid any number of times on cast). */ replicate?: Cost;
  /** ETB counters only if this condition holds (Raid). */ etbCountersIf?: Cond;
  /** Room (split enchantment): both doors, unlock costs and face abilities. */ room?: { doors: RoomDoor[] };
  /** Morph cost. Cast face down as a 2/2 for {3}; turn face up for this cost (special action). */ morph?: Cost;
  /** Disguise: morph plus ward {2} while face down. */ disguise?: boolean;
  /** Megamorph: morph, and when turned face up put a +1/+1 counter on it. */ megamorph?: boolean;
  plot?: Cost; adapt?: number; awaken?: { n: number; cost: Cost }; scavenge?: Cost;
  prototype?: { cost: Cost; power: number; toughness: number }; cipher?: boolean;
  fading?: number; vanishing?: number; embalm?: Cost; eternalize?: Cost; learn?: boolean; outlast?: Cost;
  cumUpkeep?: Cost; extraBlock?: number; mustBlock?: boolean; asThoughUnblocked?: boolean;
  /** Sacrifice this if you control no permanents matching this filter (Seasinger etc.). */ sacIfNo?: Filter;
  /** This spell costs {N} less if it targets a tapped creature. */ costLessTgtTapped?: number;
  /** Filter land: after tapping for mana, skip next untap. */ skipNextUntap?: boolean;
  /** Impending N—cost: alternative cost; enters with N time counters and isn't a creature while it has any. */ impending?: { n: number; cost: Cost };
  /** Eminence cost reduction, from the command zone or the battlefield. */ eminence?: { n: number; f: Filter };
  /** Characteristics it has outside the battlefield (Grist). */ offBf?: CEFx;
  /** layer-system result: timestamp of the latest 'loses all abilities' effect */ loseTs?: number;
  /** Names of the rules the compiler understood (for the in-game "Supported" note). */ compiled?: boolean;
}
export interface DeckDef { id: string; name: string; /** Optional picker subtitle, e.g. FINAL FANTASY VI. */ subtitle?: string; commander: string; cards: string[]; partner?: string; /** alternative face commanders (a precon that lets you pick one). Not a partner: the game starts with exactly one of these in the command zone. */ extra?: string[] }

/** Fields of a continuous effect, by layer: 4 type/subtype, 5 color, 6 abilities, 7b base P/T. */
export interface CEFx {
  setTypes?: string[]; addTypes?: string[]; /** replace creature subtypes */ setCSub?: string[]; /** replace basic land types */ setLand?: string[]; addSub?: string[];
  setColors?: Color[]; addColors?: Color[];
  loseAll?: boolean; addKw?: string[]; grant?: Pick<CardDef, 'mana' | 'abilities' | 'triggers' | 'statics'> & { text?: string };
  p?: number; t?: number;
}
