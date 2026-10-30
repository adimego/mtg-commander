// Shared engine types. The data-driven ability system: compiled Oracle text and hand-written card data both produce these.
export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
/** A mana unit; 'W|U' means one mana of either color (dual lands). */
export type ManaSym = Color | 'C' | 'ANY' | 'IDENTITY' | `${string}|${string}`;
export const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];
/** Mana cost. `x` = number of {X}; `hyb` = hybrid units like 'W|U' or '2|W'; `phy` = Phyrexian colored symbols (pay color or 2 life). */
export interface Cost { generic: number; W?: number; U?: number; B?: number; R?: number; G?: number; C?: number; x?: number; hyb?: string[]; phy?: Color[] }
/** Legacy target specs (hand-written cards). */
export type TargetSpec = 'any' | 'creature' | 'oppCreature' | 'tappedCreature' | 'nonblackCreature' | 'nonartifactCreature' | 'spell' | 'noncreatureSpell' | 'creatureSpell';

/** Object filter for permanents / cards / spells. Types match card types or subtypes. */
export interface Filter {
  types?: string[]; anyType?: string[]; notTypes?: string[]; ctrl?: 'you' | 'opp';
  colors?: Color[]; notColors?: Color[]; colorless?: boolean; multicolor?: boolean;
  tapped?: boolean; untapped?: boolean; other?: boolean; token?: boolean; nontoken?: boolean;
  powLE?: number; powGE?: number; mvLE?: number; mvGE?: number; attacking?: boolean; blocking?: boolean; atkOrBlk?: boolean;
  legendary?: boolean; nonlegendary?: boolean; basic?: boolean; nonbasic?: boolean; kw?: string; noKw?: string; name?: string; notName?: string;
}
/** One target slot. who: perm = permanent on battlefield; any = creature/planeswalker/player; player/opp = players; spell / ability = on the stack; card = card in a graveyard. */
export interface TSlot { who: 'perm' | 'any' | 'player' | 'opp' | 'spell' | 'ability' | 'card'; f?: Filter; zoneOwner?: 'you' | 'opp' | 'any'; opt?: boolean; harm?: boolean; label?: string; same?: number }
export type Amt = number | string | { maxPow: Filter } | { count: Filter; zone?: 'battlefield' | 'graveyard'; pl?: PRef } | { pow: Ref } | { tough: Ref } | { mv: Ref } | { cards: 'hand' | 'graveyard' | 'library'; pl: PRef; f?: Filter } | { life: PRef } | { mul: number; of: Amt } | { plus: number; of: Amt } | { ctr: string; who: Ref } | { half: Amt } | { devotion: Color[] } | { opps: true } | { lifeLost: true } | { lostWay: true } | { lifeGained: true };
/** Reference to objects: self, ev (event card), t0..tN (targets), created, chosen, attached (what the source is attached to), host, all:filter. */
export type Ref = string | { all: Filter; zone?: 'graveyard' };
/** Player reference: you, opps, all, evp (event player), tctl (controller of target 0), t0 (player target slot 0), ctl:tN, def (defending), owner:tN. */
export type PRef = string;
export interface Cond {
  k: 'yourTurn' | 'notYourTurn' | 'control' | 'controlNo' | 'lifeGE' | 'lifeLE' | 'kicked' | 'handLE' | 'handGE' | 'gyGE' | 'oppControlsMore' | 'attacking' | 'tapped' | 'untapped' | 'evCtlYou' | 'evCtlOpp' | 'evIs' | 'xGE' | 'lifeGainedThisTurn' | 'cardsInGyGE' | 'noCardsHand' | 'manaSpent' | 'oppLifeLE' | 'gotCounters' | 'creatureDiedThisTurn' | 'descended' | 'oppsGE' | 'not';
  f?: Filter; n?: number; ref?: Ref; c?: Cond;
}
export interface TokenSpec { name: string; p?: number; t?: number; colors: Color[]; types: string[]; sub?: string[]; kws?: string[]; legendary?: boolean; preset?: 'Treasure' | 'Food' | 'Clue' | 'Blood' | 'Map' | 'Gold' | 'Powerstone' }
export interface Effect {
  op: string; n?: Amt; m?: Amt; toHand?: boolean;
  who?: Ref; pl?: PRef; f?: Filter; kw?: string[]; kind?: string; tok?: TokenSpec; dest?: 'hand' | 'battlefield' | 'top' | 'bottom' | 'graveyard' | 'exile';
  tapped?: boolean; attacking?: boolean; sub?: Effect[]; cond?: Cond; text?: string; mana?: string[]; rest?: 'bottom' | 'graveyard' | 'top' | 'hand' | 'exile'; take?: Amt; eot?: boolean; random?: boolean; upTo?: boolean;
  zone?: 'graveyard' | 'library' | 'hand' | 'battlefield'; reveal?: boolean; sh?: boolean; other?: Ref; until?: 'eot' | 'yourNext'; ctl?: PRef; ret?: 'eot' | 'now'; ifPaid?: Cost; /** emblem definition (op 'emblem') */ emb?: CardDef;
}
export interface ManaAbility { add: ManaSym[]; sac?: boolean; n?: Amt; cost?: Cost; tap?: boolean; /** damage dealt to you when tapped for colored mana (painlands) */ pain?: number }
export interface ActAbility {
  label: string; tap?: boolean; untap?: boolean; mana?: Cost; sac?: boolean; target?: TargetSpec; effects: Effect[];
  tslots?: TSlot[]; sacF?: { f: Filter; n: number; other?: boolean }; discard?: number; discardRandom?: boolean; life?: number; remC?: { kind: string; n: number }; addC?: { kind: string; n: number };
  exileGy?: { f?: Filter; n: number; self?: boolean }; tapF?: { f: Filter; n: number }; loyalty?: number; /** -X loyalty: X chosen on activation */ loyX?: boolean; sorcery?: boolean; zone?: 'hand' | 'graveyard'; equip?: boolean; once?: boolean; exileSelf?: boolean; returnSelf?: boolean; reveal?: boolean; modes?: Modes; xFromMana?: boolean; cond?: Cond; manaAb?: boolean;
}
export interface Modes { min: number; max: number; list: { label: string; tslots?: TSlot[]; effects: Effect[] }[] }
export interface TriggerDef {
  on: string; filter?: string; cond?: string; target?: TargetSpec; label: string; effects: Effect[];
  // compiled triggers (on === 'x')
  ev?: string; subj?: 'self' | 'other' | 'any' | 'attached'; f?: Filter; pl?: 'you' | 'opp' | 'any' | 'notyou'; tslots?: TSlot[]; ifc?: Cond; modes?: Modes; kindF?: string; zoneFrom?: string; once?: boolean; combat?: boolean;
}
export interface Static { k: 'pt' | 'kw' | 'cantBlock' | 'cantAttack' | 'costLess' | 'costMore' | 'unblockable' | 'mustAttack' | 'noMaxHand' | 'cantBeBlockedBy' | 'doesntUntap'; who: 'self' | 'attached' | 'others' | 'all'; f?: Filter; p?: number | Amt; t?: number | Amt; kws?: string[]; n?: number; spellF?: Filter; cond?: Cond }
export interface CardDef {
  id: string; name: string; types: string[]; legendary?: boolean; basic?: boolean; cost: Cost; colors: Color[]; power?: number; toughness?: number;
  keywords?: string[]; text: string; typeLine?: string; img?: string; art?: string; sub?: string[];
  mana?: ManaAbility[]; abilities?: ActAbility[]; triggers?: TriggerDef[]; spell?: { target?: TargetSpec; effects: Effect[]; tslots?: TSlot[]; modes?: Modes };
  static?: { p: number; t: number; others?: boolean }; statics?: Static[]; mustAttack?: boolean; uncounterable?: boolean;
  /** Enters the battlefield tapped. */ etbTapped?: boolean;
  /** Set for imported cards whose rules text is not (fully) modelled: explains what the game does with it. */ limited?: string;
  /** Scryfall color identity (imported cards); overrides the computed one. */ identity?: Color[];
  kicker?: Cost; flashback?: Cost; ward?: number; loyalty?: number; aura?: TSlot; convoke?: boolean; etbCounters?: { kind: string; n: Amt }; token?: boolean;
  /** "Partner" / "Choose a Background" etc.: can be one of two commanders. */ partner?: boolean; canBeCommander?: boolean;
  /** Shockland: may pay this much life to enter untapped. */ shock?: number; /** Enters tapped unless the condition holds. */ etbTappedUnless?: Cond;
  /** "costs {1} less to cast for each ..." */ selfCostLess?: { n: number; per: Amt };
  /** Additional casting costs. */ extraCost?: { sacF?: { f: Filter; n: number }; discard?: number; life?: number };
  /** Names of the rules the compiler understood (for the in-game "Supported" note). */ compiled?: boolean;
}
export interface DeckDef { id: string; name: string; commander: string; cards: string[]; partner?: string }
