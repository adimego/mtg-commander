import { describe, it, expect } from 'vitest';
import { normalize } from '../src/engine/oracle';
import { tokenize, splitTokenLines, guessProduction, tokensText } from '../src/engine/grammar';
import { parseCard } from '../src/engine/grammar';
import { compileScry, parseScry } from '../src/import/classify';
import { equivCardDef, formatValidationErrors, validateCardScript } from '../src/engine/grammar';
import type { CardDef } from '../src/engine/types';
import type { ScryCard } from '../src/import/scryfall';

const bolt = {
  object: 'card', name: 'Test Bolt', lang: 'en', layout: 'normal',
  mana_cost: '{R}', cmc: 1, type_line: 'Instant',
  oracle_text: 'Test Bolt deals 3 damage to any target.',
  colors: ['R'], color_identity: ['R'], keywords: [], legalities: { commander: 'legal' },
} as unknown as ScryCard;

describe('tokenizer', () => {
  it('tokenizes mana, ~, phrasal keywords, and +1/+1', () => {
    const src = normalize('{T}: Test Bolt deals 1 damage to any target. Put a +1/+1 counter on ~. It gains first strike until end of turn.', 'Test Bolt');
    const toks = tokenize(src);
    expect(toks.some(t => t.kind === 'mana' && t.text === '{t}')).toBe(true);
    expect(toks.some(t => t.kind === 'self')).toBe(true);
    expect(toks.some(t => t.kind === 'counter' && t.text === '+1/+1')).toBe(true);
    expect(toks.some(t => t.kind === 'keyword' && t.text === 'first strike')).toBe(true);
    expect(toks.some(t => t.kind === 'until' && t.text === 'until end of turn')).toBe(true);
    const colon = toks.findIndex(t => t.text === ':');
    expect(guessProduction(toks)).toBe('activated');
    expect(colon).toBeGreaterThan(0);
    expect(tokensText(toks).includes('damage')).toBe(true);
  });

  it('joins modal bullets onto the previous line', () => {
    const lines = splitTokenLines(tokenize('choose one —\n• draw a card\n• destroy target creature'));
    expect(lines).toHaveLength(1);
    expect(guessProduction(lines[0])).toBe('modes');
  });

  it('tags a landfall ability word and a triggered line', () => {
    const toks = tokenize('landfall — whenever a land you control enters, draw a card');
    expect(toks[0].kind).toBe('abilityWord');
    expect(guessProduction(toks)).toBe('triggered');
  });
});

describe('parser', () => {
  it('parses a simple damage instant to equivalent IR', () => {
    const old = compileScry(bolt);
    const parsed = parseScry(bolt);
    expect(old.support).toBe('auto');
    expect(parsed.support).toBe('auto');
    expect(equivCardDef(old.def, parsed.def)).toBe(true);
    const seed: CardDef = { id: 'x-test-bolt', name: 'Test Bolt', types: ['Instant'], cost: { generic: 0, R: 1 }, colors: ['R'], text: bolt.oracle_text! };
    const r = parseCard({ name: bolt.name, oracle_text: bolt.oracle_text, type_line: bolt.type_line }, seed);
    expect(r.ok).toBe(true);
    expect(r.script.spell?.effects[0]?.kind).toBe('damage');
    expect(r.failures).toEqual([]);
    const v2 = validateCardScript(r.script);
    expect(v2.ok, v2.ok ? '' : formatValidationErrors(v2.errors)).toBe(true);
  });

  it('reports a structured failure that names the clause for an unknown sentence', () => {
    const seed: CardDef = { id: 'x-weird', name: 'Weird', types: ['Instant'], cost: { generic: 0 }, colors: [], text: 'Frobnicate the fifth sun.' };
    const r = parseCard({ name: 'Weird', oracle_text: 'Frobnicate the fifth sun.', type_line: 'Instant' }, seed);
    expect(r.ok).toBe(false);
    expect(r.failures.length).toBeGreaterThan(0);
    expect(r.failures[0].text.toLowerCase()).toMatch(/frobnicate/);
    expect(r.failures[0].production).toBeTruthy();
    expect(r.failures[0].reason).toBeTruthy();
    expect(r.failures[0].line).toBe(1);
  });

  it('parses a triggered ETB as a triggered production', () => {
    const scry = {
      object: 'card', name: 'ETB Draw', lang: 'en', layout: 'normal',
      mana_cost: '{W}', cmc: 1, type_line: 'Creature — Human', oracle_text: 'When ETB Draw enters, draw a card.',
      colors: ['W'], color_identity: ['W'], power: '1', toughness: '1', keywords: [], legalities: { commander: 'legal' },
    } as unknown as ScryCard;
    const old = compileScry(scry);
    const parsed = parseScry(scry);
    expect(parsed.support).toBe(old.support);
    expect(equivCardDef(old.def, parsed.def)).toBe(true);
    expect(parsed.def.triggers?.[0]).toBeTruthy();
  });
});
