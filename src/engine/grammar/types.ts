/** Versioned CardScript IR. TypeScript is canonical; see schema.ts / schema.json for the published JSON Schema. */
import type { Amt, ActAbility, CardDef, CEFx, Color, Cond, Cost, Effect, Filter, ManaAbility, Modes, Ref, RoomDoor, Static, TokenSpec, TriggerDef, TSlot } from '../types';

/** Published schema id for CardScript v1. */
export const CARD_SCRIPT_SCHEMA = 'mtg-commander.card-script.v1' as const;
export type CardScriptSchemaId = typeof CARD_SCRIPT_SCHEMA;

/** Who produced this script. `lift` is the P0 CardDef → IR path (no parser yet). */
export type ScriptSource = 'parser' | 'override' | 'ai' | 'lift';

/** Character span in the normalized Oracle text of this face (parser fills this; lift omits it). */
export interface Span { start: number; end: number; text?: string }

/** Structured leftover for a clause the grammar could not accept. */
export interface ParseFailure {
  text: string;
  reason: string;
  span?: Span;
  clause?: string;
}

export type CardLayout = 'normal' | 'transform' | 'modal_dfc' | 'adventure' | 'split' | 'flip' | 'prepare' | 'room';

/** A keyword line. Simple keywords are `{ type: "flying" }`; costs and numbers hang off the same shape. */
export interface Keyword {
  type: string;
  cost?: Cost;
  n?: number;
  text?: string;
}

/**
 * One-shot or wrapper effect. `kind` is today's `Effect.op` (mechanical v1 map).
 * Today's `Effect.kind` payload (counter type, prevent variant, script hook, …) is:
 *   - `id` when `kind === "script"` (approved runtime hook)
 *   - `tag` for every other kind
 */
export type IrEffect = {
  kind: string;
  id?: string;
  tag?: string;
  span?: Span;
  sub?: IrEffect[];
  else?: IrEffect[];
  tok?: IrTokenSpec;
  ce?: IrCEFx;
  rt?: { effects: IrEffect[]; tslots?: TSlot[]; label: string };
  emb?: CardScript;
} & Omit<Effect, 'op' | 'kind' | 'sub' | 'else' | 'tok' | 'ce' | 'rt' | 'emb'>;

export type IrTokenSpec = Omit<TokenSpec, 'ext'> & {
  ext?: {
    text?: string;
    mana?: ManaAbility[];
    abilities?: IrActAbility[];
    triggers?: IrTrigger[];
    statics?: IrStatic[];
    keywords?: Keyword[];
  };
};

export type IrCEFx = Omit<CEFx, 'grant'> & { grant?: IrGrant };

export type IrGrant = { text?: string; mana?: ManaAbility[]; abilities?: IrActAbility[]; triggers?: IrTrigger[]; statics?: IrStatic[] };

export type IrModes = Omit<Modes, 'list'> & { list: { label: string; tslots?: TSlot[]; effects: IrEffect[] }[] };

export type IrTrigger = Omit<TriggerDef, 'effects' | 'modes'> & { effects: IrEffect[]; modes?: IrModes; span?: Span };

export type IrStatic = Omit<Static, 'k' | 'grant'> & { kind: Static['k']; grant?: IrGrant; span?: Span };

export type IrActAbility = Omit<ActAbility, 'effects' | 'modes'> & { effects: IrEffect[]; modes?: IrModes; span?: Span };

export type IrSpell = { target?: CardDef['spell'] extends infer S | undefined ? S extends { target?: infer T } ? T : undefined : undefined; effects: IrEffect[]; tslots?: TSlot[]; modes?: IrModes };

export type IrRoomDoor = Omit<RoomDoor, 'triggers' | 'abilities' | 'statics' | 'keywords'> & {
  triggers?: IrTrigger[];
  abilities?: IrActAbility[];
  statics?: IrStatic[];
  keywords?: Keyword[];
};

/** CardDef keys stored first-class on CardScript (not in castRules). */
export const CARD_SCRIPT_FACE_KEYS = [
  'id', 'name', 'types', 'legendary', 'basic', 'cost', 'colors', 'power', 'toughness',
  'keywords', 'text', 'typeLine', 'img', 'art', 'sub', 'mana', 'abilities', 'triggers',
  'spell', 'static', 'statics', 'limited', 'identity', 'token', 'partner', 'canBeCommander',
  'loyalty', 'back', 'mdfc', 'adventure', 'split', 'fuse', 'aftermath', 'flip', 'prepDef',
  'room', 'compiled',
] as const;
export type CardScriptFaceKey = typeof CARD_SCRIPT_FACE_KEYS[number];

/** Flag fields whose nested effects/spells must be lifted. */
export type IrCastRules = Omit<CardDef, CardScriptFaceKey | 'asEnters' | 'overload' | 'offBf'> & {
  asEnters?: IrEffect[];
  overload?: { cost: Cost; spell?: IrSpell };
  offBf?: IrCEFx;
};

/** Optional future bucket for “would/instead” (P4). v1 lift leaves this empty and keeps those in statics/scripts. */
export interface IrReplacement {
  kind: string;
  cond?: Cond;
  effects?: IrEffect[];
  span?: Span;
}

/**
 * Versioned card/face script. Multi-face cards are one script plus `faces` / `room`.
 * Effect/trigger/static/ability payloads are a mechanical map of today's engine types so
 * `lower()` can feed `exec()` / `layer()` / `planPayment()` with no second rules engine.
 */
export interface CardScript {
  schema: CardScriptSchemaId;
  source: ScriptSource;
  oracleId?: string;
  oracleTextHash?: string;
  id: string;
  name: string;
  layout?: CardLayout;
  types: string[];
  typeLine?: string;
  text?: string;
  cost: Cost;
  colors: Color[];
  identity?: Color[];
  power?: number;
  toughness?: number;
  legendary?: boolean;
  basic?: boolean;
  token?: boolean;
  loyalty?: number;
  img?: string;
  art?: string;
  sub?: string[];
  keywords?: Keyword[];
  mana?: ManaAbility[];
  abilities?: IrActAbility[];
  triggers?: IrTrigger[];
  statics?: IrStatic[];
  static?: { p: number; t: number; others?: boolean };
  spell?: IrSpell;
  replacements?: IrReplacement[];
  faces?: { back?: CardScript; prepare?: CardScript };
  room?: { doors: IrRoomDoor[] };
  mdfc?: boolean;
  adventure?: boolean;
  split?: boolean;
  fuse?: boolean;
  aftermath?: boolean;
  flip?: boolean;
  partner?: boolean;
  canBeCommander?: boolean;
  limited?: string;
  compiled?: boolean;
  /** Remaining CardDef flags (kicker, flashback, ward, …) not yet first-class productions. */
  castRules?: IrCastRules;
  failures?: ParseFailure[];
}

export type { Amt, Color, Cond, Cost, Filter, ManaAbility, Ref, TSlot };
