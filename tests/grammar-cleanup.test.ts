import { describe, it, expect, afterEach } from 'vitest';
import { classify, compileScry, parseScry, formatUnparsedReason, parserWorse } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import { applyScripts } from '../src/engine/scripts';
import { lineHash, registerLineOverride, clearLineOverrides, setGrammarEnabled } from '../src/engine/grammar';
import type { CardDef } from '../src/engine/types';

afterEach(() => {
  clearLineOverrides();
  setGrammarEnabled(true);
});

const sc = (over: Partial<ScryCard> & Pick<ScryCard, 'name' | 'type_line'>): ScryCard => ({
  color_identity: ['U'], keywords: [], colors: ['U'], mana_cost: '{U}',
  oracle_text: 'Draw a card.', ...over,
});

describe('hash-keyed overrides', () => {
  it('hashes a normalized line stably and ignores a trailing period', () => {
    const a = lineHash('draw two cards');
    const b = lineHash('draw two cards.');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).toBe(b);
    expect(lineHash('draw a card')).not.toBe(a);
  });

  it('applies an oracle_id + hash override, then falls back to name + text', () => {
    const d: CardDef = { id: 'x', name: 'Probe', types: ['Instant'], cost: { generic: 0, U: 1 }, colors: ['U'], text: '' };
    const line = 'investigate';
    const oid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    registerLineOverride(oid, line, def => { (def.spell ??= { effects: [] }).effects.push({ op: 'draw', n: 1 }); });
    const un = [line];
    applyScripts('Unknown Card', d, un, oid);
    expect(un).toEqual([]);
    expect(d.spell?.effects).toEqual([{ op: 'draw', n: 1 }]);
    expect(d.compiled).toBe(true);
  });
});

describe('Limited reason surfaces parse failures', () => {
  it('keeps the leftover line and appends the failing clause / parse reason', () => {
    const r = formatUnparsedReason(
      ['at the beginning of your upkeep, transform ~.'],
      'Delver of Secrets',
      [{ text: 'at the beginning of your upkeep, transform ~.', reason: 'unparsed triggered line', clause: 'at the beginning of your upkeep, transform ~.', line: 1, production: 'triggered' }],
    );
    expect(r).toMatch(/not modelled: "At the beginning of your upkeep, transform Delver of Secrets\."/);
    expect(r).toMatch(/unparsed triggered line/);
  });

  it('classify() Limited reason includes the parse failure when grammar is on', () => {
    const card = sc({
      name: 'Delver of Secrets',
      type_line: 'Creature — Human Wizard',
      mana_cost: '{U}', power: '1', toughness: '1', color_identity: ['U'], colors: ['U'],
      oracle_text: 'At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform Delver of Secrets.',
    });
    const r = classify(card, { grammar: true, fallback: false });
    expect(r.support).toBe('limited');
    expect(r.reason).toMatch(/Not modelled: "At the/i);
    expect(r.reason).toMatch(/unparsed /);
    expect(r.failures?.length).toBeGreaterThan(0);
  });
});

describe('fallback keeps a better parser', () => {
  it('parserWorse is true only when the parser leftover a line the old compiler accepted', () => {
    expect(parserWorse(['draw a card'], [])).toBe(true);
    expect(parserWorse(['draw a card'], ['draw a card.'])).toBe(false);
    expect(parserWorse([], ['draw a card'])).toBe(false);
    expect(parserWorse(['a', 'b'], ['a'])).toBe(true);
  });

  it('compileScry with fallback uses the parser when it is equivalent to the old compiler', () => {
    const card = sc({ name: 'Opt', type_line: 'Instant', oracle_text: 'Scry 1.\nDraw a card.', keywords: [] });
    const old = compileScry(card, { grammar: false });
    const on = compileScry(card, { grammar: true, fallback: true });
    expect(on.support).toBe(old.support);
    expect(on.support).toBe('auto');
  });
});
