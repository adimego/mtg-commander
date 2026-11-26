/** Published JSON Schema for CardScript v1. Generated `schema.json` must match this object. */
import { CARD_SCRIPT_SCHEMA } from './types';
import { CARD_LAYOUTS, COLORS, EFFECT_KINDS, SCRIPT_SOURCES, STATIC_KINDS } from './kinds';

const colorSchema = { type: 'string', enum: [...COLORS] } as const;

const costSchema = {
  type: 'object',
  required: ['generic'],
  properties: {
    generic: { type: 'number' },
    W: { type: 'number' }, U: { type: 'number' }, B: { type: 'number' }, R: { type: 'number' }, G: { type: 'number' },
    C: { type: 'number' }, x: { type: 'number' }, hyb: { type: 'array', items: { type: 'string' } },
    phy: { type: 'array', items: colorSchema }, life: { type: 'number' }, E: { type: 'number' },
  },
  additionalProperties: false,
} as const;

const keywordSchema = {
  type: 'object',
  required: ['type'],
  properties: {
    type: { type: 'string', minLength: 1 },
    cost: { $ref: '#/$defs/Cost' },
    n: { type: 'number' },
    text: { type: 'string' },
  },
  additionalProperties: false,
} as const;

const spanSchema = {
  type: 'object',
  required: ['start', 'end'],
  properties: { start: { type: 'number' }, end: { type: 'number' }, text: { type: 'string' } },
  additionalProperties: false,
} as const;

const failureSchema = {
  type: 'object',
  required: ['text', 'reason'],
  properties: {
    text: { type: 'string' },
    reason: { type: 'string' },
    span: { $ref: '#/$defs/Span' },
    clause: { type: 'string' },
  },
  additionalProperties: false,
} as const;

/** Amount, Filter, Cond, Ref, TSlot stay open objects in the published schema (same shapes as today's engine types). */
const openObject = { type: 'object' } as const;

const effectSchema = {
  type: 'object',
  required: ['kind'],
  properties: {
    kind: { type: 'string', enum: [...EFFECT_KINDS] },
    id: { type: 'string', minLength: 1, description: 'Required when kind is script: approved runtime hook id.' },
    tag: { type: 'string', description: 'Payload that today lives on Effect.kind (counter type, prevent variant, …).' },
    span: { $ref: '#/$defs/Span' },
    n: {}, m: {}, toHand: { type: 'boolean' }, who: {}, pl: { type: 'string' }, f: { $ref: '#/$defs/Filter' },
    kw: { type: 'array', items: { type: 'string' } }, tok: { $ref: '#/$defs/TokenSpec' },
    dest: { type: 'string' }, tapped: { type: 'boolean' }, attacking: { type: 'boolean' },
    sub: { type: 'array', items: { $ref: '#/$defs/Effect' } }, cond: { $ref: '#/$defs/Cond' },
    text: { type: 'string' }, mana: { type: 'array', items: { type: 'string' } }, rest: { type: 'string' },
    take: {}, eot: { type: 'boolean' }, random: { type: 'boolean' }, upTo: { type: 'boolean' },
    zone: { type: 'string' }, reveal: { type: 'boolean' }, sh: { type: 'boolean' }, other: {},
    until: { type: 'string' }, ctl: { type: 'string' }, ret: { type: 'string' }, ifPaid: { $ref: '#/$defs/Cost' },
    ce: { $ref: '#/$defs/CEFx' }, rt: { type: 'object' }, free: { type: 'boolean' },
    emb: { $ref: '#/$defs/CardScript' }, else: { type: 'array', items: { $ref: '#/$defs/Effect' } },
  },
} as const;

const spellSchema = {
  type: 'object',
  required: ['effects'],
  properties: {
    target: { type: 'string' },
    effects: { type: 'array', items: { $ref: '#/$defs/Effect' } },
    tslots: { type: 'array', items: { $ref: '#/$defs/TSlot' } },
    modes: { $ref: '#/$defs/Modes' },
  },
} as const;

const triggerSchema = {
  type: 'object',
  required: ['on', 'label', 'effects'],
  properties: {
    on: { type: 'string' }, ev: { type: 'string' }, label: { type: 'string' },
    effects: { type: 'array', items: { $ref: '#/$defs/Effect' } },
    modes: { $ref: '#/$defs/Modes' }, span: { $ref: '#/$defs/Span' },
  },
} as const;

const staticSchema = {
  type: 'object',
  required: ['kind', 'who'],
  properties: {
    kind: { type: 'string', enum: [...STATIC_KINDS] },
    who: { type: 'string', enum: ['self', 'attached', 'others', 'all'] },
    grant: { $ref: '#/$defs/Grant' },
    span: { $ref: '#/$defs/Span' },
  },
} as const;

const abilitySchema = {
  type: 'object',
  required: ['label', 'effects'],
  properties: {
    label: { type: 'string' },
    effects: { type: 'array', items: { $ref: '#/$defs/Effect' } },
    modes: { $ref: '#/$defs/Modes' },
    span: { $ref: '#/$defs/Span' },
  },
} as const;

const cardScriptProperties = {
  schema: { type: 'string', const: CARD_SCRIPT_SCHEMA },
  source: { type: 'string', enum: [...SCRIPT_SOURCES] },
  oracleId: { type: 'string' },
  oracleTextHash: { type: 'string' },
  id: { type: 'string', minLength: 1 },
  name: { type: 'string', minLength: 1 },
  layout: { type: 'string', enum: [...CARD_LAYOUTS] },
  types: { type: 'array', items: { type: 'string' } },
  typeLine: { type: 'string' },
  text: { type: 'string' },
  cost: { $ref: '#/$defs/Cost' },
  colors: { type: 'array', items: { $ref: '#/$defs/Color' } },
  identity: { type: 'array', items: { $ref: '#/$defs/Color' } },
  power: { type: 'number' },
  toughness: { type: 'number' },
  legendary: { type: 'boolean' },
  basic: { type: 'boolean' },
  token: { type: 'boolean' },
  loyalty: { type: 'number' },
  img: { type: 'string' },
  art: { type: 'string' },
  sub: { type: 'array', items: { type: 'string' } },
  keywords: { type: 'array', items: { $ref: '#/$defs/Keyword' } },
  mana: { type: 'array', items: { type: 'object' } },
  abilities: { type: 'array', items: { $ref: '#/$defs/ActAbility' } },
  triggers: { type: 'array', items: { $ref: '#/$defs/Trigger' } },
  statics: { type: 'array', items: { $ref: '#/$defs/Static' } },
  static: { type: 'object' },
  spell: { $ref: '#/$defs/Spell' },
  replacements: { type: 'array', items: { type: 'object' } },
  faces: {
    type: 'object',
    properties: {
      back: { $ref: '#/$defs/CardScript' },
      prepare: { $ref: '#/$defs/CardScript' },
    },
    additionalProperties: false,
  },
  room: {
    type: 'object',
    required: ['doors'],
    properties: { doors: { type: 'array', items: { $ref: '#/$defs/RoomDoor' } } },
  },
  mdfc: { type: 'boolean' },
  adventure: { type: 'boolean' },
  split: { type: 'boolean' },
  fuse: { type: 'boolean' },
  aftermath: { type: 'boolean' },
  flip: { type: 'boolean' },
  partner: { type: 'boolean' },
  canBeCommander: { type: 'boolean' },
  limited: { type: 'string' },
  compiled: { type: 'boolean' },
  castRules: { type: 'object', description: 'Remaining CardDef flags not yet first-class (kicker, flashback, ward, …).' },
  failures: { type: 'array', items: { $ref: '#/$defs/ParseFailure' } },
} as const;

export const cardScriptJsonSchema = {
  $id: 'mtg-commander.card-script.v1',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'CardScript',
  description: 'Versioned IR for compiled Magic: The Gathering Oracle text in mtg-commander. TypeScript types in src/engine/grammar/types.ts are canonical; this schema is the published contract for validators, repo caches, and a future AI writer. v1 effects map mechanically to today\'s Effect/TriggerDef/Static so exec() and layer() can run lowered IR.',
  $ref: '#/$defs/CardScript',
  $defs: {
    Color: colorSchema,
    Cost: costSchema,
    Keyword: keywordSchema,
    Span: spanSchema,
    ParseFailure: failureSchema,
    Filter: openObject,
    Cond: openObject,
    TSlot: openObject,
    Amount: {},
    Effect: effectSchema,
    Spell: spellSchema,
    Trigger: triggerSchema,
    Static: staticSchema,
    ActAbility: abilitySchema,
    Modes: {
      type: 'object',
      required: ['min', 'max', 'list'],
      properties: {
        min: { type: 'number' },
        max: { type: 'number' },
        list: {
          type: 'array',
          items: {
            type: 'object',
            required: ['label', 'effects'],
            properties: {
              label: { type: 'string' },
              tslots: { type: 'array', items: { $ref: '#/$defs/TSlot' } },
              effects: { type: 'array', items: { $ref: '#/$defs/Effect' } },
            },
          },
        },
      },
    },
    TokenSpec: { type: 'object' },
    CEFx: { type: 'object' },
    Grant: { type: 'object' },
    RoomDoor: {
      type: 'object',
      required: ['name', 'cost'],
      properties: {
        name: { type: 'string' },
        cost: { $ref: '#/$defs/Cost' },
        text: { type: 'string' },
        keywords: { type: 'array', items: { $ref: '#/$defs/Keyword' } },
        abilities: { type: 'array', items: { $ref: '#/$defs/ActAbility' } },
        triggers: { type: 'array', items: { $ref: '#/$defs/Trigger' } },
        statics: { type: 'array', items: { $ref: '#/$defs/Static' } },
        mana: { type: 'array', items: { type: 'object' } },
        img: { type: 'string' },
        art: { type: 'string' },
      },
    },
    CardScript: {
      type: 'object',
      required: ['schema', 'source', 'id', 'name', 'types', 'cost', 'colors'],
      properties: cardScriptProperties,
    },
  },
} as const;

export function schemaJson(): string {
  return `${JSON.stringify(cardScriptJsonSchema, null, 2)}\n`;
}
