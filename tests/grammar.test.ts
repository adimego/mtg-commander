import { describe, it, expect, afterEach } from 'vitest';
import {
  CARD_SCRIPT_SCHEMA, cardScriptJsonSchema, schemaJson, validateCardScript, formatValidationErrors,
  liftCardDef, lowerCardScript, lowerEffect, sameCardDef, diffCardDef, isGrammarEnabled,
  setGrammarEnabled, maybeApplyGrammar, EFFECT_KINDS,
} from '../src/engine/grammar';
import type { CardScript } from '../src/engine/grammar';
import { compileScry, classify } from '../src/import/classify';
import type { CardDef } from '../src/engine/types';
import schemaOnDisk from '../src/engine/grammar/schema.json';

afterEach(() => setGrammarEnabled(false));

const shock: CardScript = {
  schema: CARD_SCRIPT_SCHEMA,
  source: 'override',
  id: 'x-shock',
  name: 'Shock',
  types: ['Instant'],
  text: 'Shock deals 2 damage to any target.',
  cost: { generic: 1, R: 1 },
  colors: ['R'],
  spell: {
    effects: [{ kind: 'damage', n: 2, who: 't0' }],
    tslots: [{ who: 'any', harm: true }],
  },
};

describe('CardScript schema and validator', () => {
  it('accepts a hand-written script and lowers it to Effect.op', () => {
    const v = validateCardScript(shock);
    expect(v.ok, v.ok ? '' : formatValidationErrors(v.errors)).toBe(true);
    const def = lowerCardScript(shock);
    expect(def.name).toBe('Shock');
    expect(def.cost).toEqual({ generic: 1, R: 1 });
    expect(def.spell?.effects).toEqual([{ op: 'damage', n: 2, who: 't0' }]);
    expect(def.spell?.tslots).toEqual([{ who: 'any', harm: true }]);
    expect(lowerEffect({ kind: 'script', id: 'populate' })).toEqual({ op: 'script', kind: 'populate' });
  });

  it('rejects a missing schema, unknown source, and a script effect without an id', () => {
    expect(validateCardScript({ ...shock, schema: 'nope' }).ok).toBe(false);
    expect(validateCardScript({ ...shock, source: 'wizard' }).ok).toBe(false);
    const bad: CardScript = {
      ...shock,
      spell: { effects: [{ kind: 'script' }] },
    };
    const v = validateCardScript(bad);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(formatValidationErrors(v.errors)).toMatch(/script effects require a non-empty hook id/);
  });

  it('rejects an unknown effect kind', () => {
    const v = validateCardScript({ ...shock, spell: { effects: [{ kind: 'not-a-real-op' }] } });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(formatValidationErrors(v.errors)).toMatch(/unknown kind/);
  });

  it('checked-in schema.json matches the canonical schema.ts export', () => {
    expect(schemaOnDisk).toEqual(JSON.parse(schemaJson()));
    expect(cardScriptJsonSchema.$id).toBe(CARD_SCRIPT_SCHEMA);
    expect(EFFECT_KINDS).toContain('energy');
    expect(EFFECT_KINDS).toContain('script');
  });
});

describe('lift / lower', () => {
  it('roundtrips a compiled Lightning Bolt-style instant fixture', () => {
    const scry = {
      object: 'card', name: 'Test Bolt', lang: 'en', layout: 'normal',
      mana_cost: '{R}', cmc: 1, type_line: 'Instant', oracle_text: 'Test Bolt deals 3 damage to any target.',
      colors: ['R'], color_identity: ['R'], keywords: [], legalities: { commander: 'legal' },
    } as never;
    const cl = compileScry(scry);
    expect(cl.support).toBe('auto');
    const ir = liftCardDef(cl.def, { source: 'lift' });
    expect(ir.schema).toBe(CARD_SCRIPT_SCHEMA);
    expect(ir.source).toBe('lift');
    expect(ir.spell?.effects[0]?.kind).toBe('damage');
    const v = validateCardScript(ir);
    expect(v.ok, v.ok ? '' : formatValidationErrors(v.errors)).toBe(true);
    const lowered = lowerCardScript(ir);
    expect(diffCardDef(cl.def, lowered)).toEqual([]);
    expect(sameCardDef(cl.def, lowered)).toBe(true);
  });

  it('maps Effect.kind payload to tag / script id and back', () => {
    const d: CardDef = {
      id: 'x-fx', name: 'Fx', types: ['Instant'], cost: { generic: 0 }, colors: [], text: '',
      spell: { effects: [{ op: 'addC', kind: '+1/+1', n: 1, who: 't0' }, { op: 'script', kind: 'populate' }] },
    };
    const ir = liftCardDef(d);
    expect(ir.spell?.effects).toEqual([
      { kind: 'addC', tag: '+1/+1', n: 1, who: 't0' },
      { kind: 'script', id: 'populate' },
    ]);
    expect(sameCardDef(d, lowerCardScript(ir))).toBe(true);
  });
});

describe('grammar feature flag', () => {
  it('is off by default and does not change classify()', () => {
    expect(isGrammarEnabled()).toBe(false);
    const scry = {
      object: 'card', name: 'Test Draw', lang: 'en', layout: 'normal',
      mana_cost: '{U}', cmc: 1, type_line: 'Instant', oracle_text: 'Draw a card.',
      colors: ['U'], color_identity: ['U'], keywords: [], legalities: { commander: 'legal' },
    } as never;
    const off = classify(scry);
    const on = classify(scry, { grammar: true });
    expect(off.support).toBe(on.support);
    expect(sameCardDef(off.def, on.def)).toBe(true);
    setGrammarEnabled(true);
    expect(isGrammarEnabled()).toBe(true);
    const flagged = classify(scry);
    expect(sameCardDef(off.def, flagged.def)).toBe(true);
    setGrammarEnabled(false);
    const passthrough = maybeApplyGrammar(off);
    expect(passthrough).toBe(off);
  });
});
