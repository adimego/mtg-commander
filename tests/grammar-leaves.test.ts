import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/engine/grammar/tokenize';
import { Cursor } from '../src/engine/grammar/cursor';
import { parseAmount, parseDuration, parsePlayerRef, parseTarget, parseWrappers, applyWrappers } from '../src/engine/grammar/leaves';

function cur(s: string): Cursor {
  return new Cursor(tokenize(s));
}

describe('token-native leaves', () => {
  it('parses numeric and word amounts', () => {
    expect(parseAmount(cur('3 damage'))).toBe(3);
    expect(parseAmount(cur('two cards'))).toBe(2);
    expect(parseAmount(cur('x'))).toBe('X');
    expect(parseAmount(cur('that many'))).toBe('that');
    expect(parseAmount(cur('creature'))).toBeNull();
  });

  it('parses until-end-of-turn and until-your-next-turn durations', () => {
    expect(parseDuration(cur('until end of turn'))).toBe('eot');
    expect(parseDuration(cur('until your next turn'))).toBe('yourNext');
    expect(parseDuration(cur('until the end of your next turn'))).toBe('yourNext');
    expect(parseDuration(cur('draw a card'))).toBeUndefined();
  });

  it('parses player references', () => {
    expect(parsePlayerRef(cur('you'))).toBe('you');
    expect(parsePlayerRef(cur('each opponent'))).toBe('opps');
    expect(parsePlayerRef(cur('target player'))).toBe('t0');
    expect(parsePlayerRef(cur('each player'))).toBe('all');
  });

  it('parses target any / target creature / each creature', () => {
    const any = parseTarget(cur('any target'), true);
    expect(any?.slots).toEqual([{ who: 'any', harm: true, opt: false }]);
    const cr = parseTarget(cur('target creature'));
    expect(cr?.who).toBe('t0');
    expect(cr?.slots[0]?.who).toBe('perm');
    expect(cr?.filter?.types).toContain('Creature');
    const each = parseTarget(cur('each creature'));
    expect(each?.each).toBe(true);
    expect(each?.filter?.types).toContain('Creature');
  });

  it('strips you-may, leading if, and trailing until wrappers', () => {
    const w = parseWrappers(tokenize('you may draw a card until end of turn'));
    expect(w.wrap.may).toBe(true);
    expect(w.wrap.until).toBe('eot');
    expect(w.inner.remainingText()).toBe('draw a card');
    const iff = parseWrappers(tokenize('if you control a creature, draw a card'));
    expect(iff.wrap.condText).toBe('you control a creature');
    expect(iff.inner.remainingText()).toBe('draw a card');
    const fx = applyWrappers([{ op: 'draw', n: 1 }], { may: true, until: 'eot' });
    expect(fx[0].op).toBe('may');
    expect((fx[0] as { sub: { until?: string }[] }).sub[0].until).toBe('eot');
  });
});
