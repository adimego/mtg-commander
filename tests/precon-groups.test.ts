import { describe, it, expect } from 'vitest';
import { loadPrecons, isOfficialPrecon, groupOfficialPrecons, type Precon } from '../src/import/precons';

const stub = (o: Partial<Precon> & Pick<Precon, 'id' | 'name' | 'set' | 'setName'>): Precon => ({
  commander: 'x', cards: [], supported: 100, total: 100, unsupported: [], ...o,
});

describe('groupOfficialPrecons', () => {
  it('groups official precons newest-first and omits custom USR lists', () => {
    const ps = loadPrecons();
    const groups = groupOfficialPrecons(ps);
    expect(groups.map(g => [g.set, g.setName, g.released, g.decks.length])).toEqual([
      ['TRC', 'Star Trek Commander', '2026-11-13', 4],
      ['FRC', 'Reality Fracture Commander', '2026-10-02', 1],
      ['MSC', 'Marvel Super Heroes Commander', '2026-06-26', 4],
      ['SOC', 'Secrets of Strixhaven Commander', '2026-04-24', 5],
    ]);
    expect(groups.flatMap(g => g.decks).every(isOfficialPrecon)).toBe(true);
    expect(groups.flatMap(g => g.decks).map(d => d.name).sort()).toEqual([
      'Avengers Assemble', 'Doom Prevails', 'Federation Fleet', 'Klingon Fury',
      'Landing Party', 'Lorehold Spirit', 'Multiverse Reforged', 'Prismari Artistry', 'Quandrix Unlimited',
      'Silverquill Influence', 'The Fantastic Four', 'Wakanda Forever', 'We Are the Borg', 'Witherbloom Pestilence',
    ]);
    expect(ps.filter(p => p.set === 'USR').map(p => p.name)).toEqual(['Namor the Sub-Mariner', "Zurgo, Thunder's Decree", 'Krenko, Mob Boss']);
  });

  it('treats any non-USR set as official so a new product groups without an allowlist change', () => {
    expect(isOfficialPrecon({ set: 'MSC' })).toBe(true);
    expect(isOfficialPrecon({ set: 'ZZZ' })).toBe(true);
    expect(isOfficialPrecon({ set: 'USR' })).toBe(false);
    const extra = stub({ id: 'precon-zzz-future', name: 'Future Precon', set: 'ZZZ', setName: 'Future Commander', released: '2027-01-01' });
    const groups = groupOfficialPrecons([...loadPrecons(), extra]);
    expect(groups[0]).toMatchObject({ set: 'ZZZ', setName: 'Future Commander', released: '2027-01-01' });
    expect(groups[0].decks.map(d => d.name)).toEqual(['Future Precon']);
    expect(groups.map(g => g.set)).toEqual(['ZZZ', 'TRC', 'FRC', 'MSC', 'SOC']);
  });
});
