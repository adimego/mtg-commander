import { describe, it, expect } from 'vitest';
import { classify, parseScry, compileScry } from '../src/import/classify';
import { trigger, effects, newCx, normalize } from '../src/engine/oracle';
import type { ScryCard } from '../src/import/scryfall';
import { parseNativeLine } from '../src/engine/grammar/native';

const sc = (over: Partial<ScryCard> & Pick<ScryCard, 'name' | 'type_line' | 'oracle_text'>): ScryCard => ({
  color_identity: over.color_identity ?? ['B'], keywords: over.keywords ?? [], colors: over.colors ?? ['B'],
  mana_cost: over.mana_cost ?? '{1}{B}', ...over,
});

describe('P2 leftover trigger heads', () => {
  it('parses "~ deals combat damage" (any combat damage, not only to a player)', () => {
    const tr = trigger('~ deals combat damage');
    expect(tr?.defs[0]).toMatchObject({ ev: 'combatDamage', subj: 'self' });
  });

  it('parses "~ becomes tapped"', () => {
    const tr = trigger('~ becomes tapped');
    expect(tr?.defs[0]).toMatchObject({ ev: 'becomesTapped', subj: 'self' });
  });

  it('parses an opponent discarding a card or a typed card', () => {
    expect(trigger('an opponent discards a card')?.defs[0]).toMatchObject({ ev: 'discard', pl: 'notyou' });
    const typed = trigger('an opponent discards a creature card');
    expect(typed?.defs[0]).toMatchObject({ ev: 'discard', pl: 'notyou' });
    expect(typed?.defs[0].f?.types).toContain('Creature');
  });

  it('parses the beginning of your second main phase', () => {
    expect(trigger('the beginning of your second main phase')?.defs[0]).toMatchObject({ ev: 'secondMain', pl: 'you' });
  });

  it('parses becoming the target of a spell or ability an opponent controls', () => {
    expect(trigger('~ becomes the target of a spell or ability an opponent controls')?.defs[0])
      .toMatchObject({ ev: 'targeted', subj: 'self', pl: 'opp' });
  });

  it('parses "you cast a spell with mana value N or greater"', () => {
    expect(trigger('you cast a spell with mana value 5 or greater')?.defs[0])
      .toMatchObject({ ev: 'cast', pl: 'you', mvGE: 5 });
  });
});

describe('P2 wrappers and comma split', () => {
  it('keeps "noncreature, nonland" in the trigger head and compiles the draw body', () => {
    const hit = parseNativeLine('whenever an opponent discards a noncreature, nonland card, draw a card.', { isSpell: false, sc: { name: 'Waste Not' } });
    expect(hit?.production).toBe('triggered');
    expect(hit?.trigger?.ev).toBe('discard');
    expect(hit?.effects.some(e => e.op === 'draw')).toBe(true);
  });

  it('still splits "when ~ enters, if it was kicked, …" after the event', () => {
    const hit = parseNativeLine('when ~ enters, if it was kicked, it deals 2 damage to any target.', { isSpell: false, sc: { name: 'Angel' } });
    expect(hit?.trigger?.ev).toBe('etb');
    expect(hit?.effects[0]?.op === 'if' || hit?.effects.some(e => e.op === 'damage' || e.op === 'if')).toBe(true);
  });
});

describe('P2 leftover families flip Limited cards (exact Oracle shapes)', () => {
  it('draw / token / add-mana: Waste Not is fully modelled', () => {
    const card = sc({
      name: 'Waste Not', type_line: 'Enchantment', mana_cost: '{1}{B}', colors: ['B'], color_identity: ['B'], keywords: [],
      oracle_text: 'Whenever an opponent discards a creature card, create a 2/2 black Zombie creature token.\nWhenever an opponent discards a land card, add {B}{B}.\nWhenever an opponent discards a noncreature, nonland card, draw a card.',
    });
    const old = compileScry(card, { grammar: false });
    const parsed = parseScry(card);
    expect(old.support).toBe('limited');
    expect(parsed.support).toBe('auto');
    expect(parsed.def.triggers).toHaveLength(3);
    expect(parsed.def.triggers!.map(t => t.effects[0].op).sort()).toEqual(['addMana', 'draw', 'token'].sort());
  });

  it('combat-damage + counters: Blood Cultist models the combat-damage trigger', () => {
    const card = sc({
      name: 'Blood Cultist', type_line: 'Creature — Human Wizard', mana_cost: '{1}{B}{R}', power: '1', toughness: '1',
      colors: ['B', 'R'], color_identity: ['B', 'R'], keywords: [],
      oracle_text: '{T}: Blood Cultist deals 1 damage to target creature.\nWhenever a creature dealt damage by Blood Cultist this turn dies, put a +1/+1 counter on Blood Cultist.',
    });
    // The dies-this-turn head is not in this P2 batch; the combat-damage form should work on its own:
    const simple = sc({
      name: 'Blood Cultist Simple', type_line: 'Creature — Human Wizard', mana_cost: '{1}{B}{R}', power: '1', toughness: '1',
      colors: ['B', 'R'], color_identity: ['B', 'R'], keywords: [],
      oracle_text: 'Whenever Blood Cultist Simple deals combat damage, put a +1/+1 counter on it.',
    });
    const parsed = parseScry(simple);
    expect(parsed.support).toBe('auto');
    expect(parsed.def.triggers?.[0]).toMatchObject({ ev: 'combatDamage', subj: 'self' });
    expect(parsed.def.triggers?.[0].effects[0].op).toBe('addC');
    void card;
  });

  it('becomes-tapped + token: Seedship Agrarian models the lander trigger', () => {
    const card = sc({
      name: 'Seedship Agrarian', type_line: 'Creature — Insect Scientist', mana_cost: '{3}{G}', power: '3', toughness: '3',
      colors: ['G'], color_identity: ['G'], keywords: [],
      oracle_text: 'Whenever this creature becomes tapped, create a Lander token.',
    });
    const parsed = parseScry(card);
    expect(parsed.support).toBe('auto');
    expect(parsed.def.triggers?.[0].ev).toBe('becomesTapped');
    expect(parsed.def.triggers?.[0].effects[0].op).toBe('token');
  });

  it('siege "this siege enters" normalizes to ~ and compiles as an ETB', () => {
    expect(normalize('When this Siege enters, draw a card.', 'Test Siege')).toMatch(/^when ~ enters, draw a card/);
    const card = sc({
      name: 'Test Siege', type_line: 'Battle — Siege', mana_cost: '{2}{B}', colors: ['B'], color_identity: ['B'], keywords: [],
      oracle_text: 'When this Siege enters, draw a card.',
    });
    const parsed = parseScry(card);
    expect(parsed.support).toBe('auto');
    expect(parsed.def.triggers?.[0].ev).toBe('etb');
  });

  it('cast-with-mana-value + food token', () => {
    const card = sc({
      name: 'Skybeast Tracker', type_line: 'Creature — Giant Archer', mana_cost: '{4}{G}', power: '3', toughness: '3',
      colors: ['G'], color_identity: ['G'], keywords: [],
      oracle_text: 'Whenever you cast a spell with mana value 5 or greater, create a Food token.',
    });
    const parsed = parseScry(card);
    expect(parsed.support).toBe('auto');
    expect(parsed.def.triggers?.[0]).toMatchObject({ ev: 'cast', mvGE: 5 });
    expect(parsed.def.triggers?.[0].effects[0].op).toBe('token');
  });

  it('does not drop a failed "if" and keep the verb (Perilous Voyage stays limited)', () => {
    const card = sc({
      name: 'Perilous Voyage', type_line: 'Instant', mana_cost: '{1}{U}', colors: ['U'], color_identity: ['U'], keywords: [],
      oracle_text: "Return target creature to its owner's hand. If its mana value was 2 or less, scry 2.",
    });
    const parsed = parseScry(card);
    expect(parsed.support).toBe('limited');
    expect(parsed.unparsed?.length).toBeGreaterThan(0);
  });

  it('does not claim support for a compound leftover it cannot fully parse', () => {
    const card = sc({
      name: 'Polymorph', type_line: 'Sorcery', mana_cost: '{3}{U}', colors: ['U'], color_identity: ['U'], keywords: [],
      oracle_text: "Destroy target creature. It can't be regenerated. Its controller reveals cards from the top of their library until they reveal a creature card. The player puts that card onto the battlefield, then shuffles all other cards revealed this way into their library.",
    });
    const parsed = parseScry(card);
    expect(parsed.support).toBe('limited');
    expect(parsed.unparsed?.length).toBeGreaterThan(0);
  });
});
