import { describe, it, expect, afterEach } from 'vitest';
import { classify } from '../src/import/classify';
import { officialPreconCardEntries, isOfficialPrecon, loadPrecons } from '../src/import/precons';
import {
  liftCardDef, lowerCardScript, validateCardScript, formatValidationErrors,
  diffCardDef, sameCardDef, setGrammarEnabled, isGrammarEnabled,
} from '../src/engine/grammar';

afterEach(() => setGrammarEnabled(false));

describe('grammar golden: official precons', () => {
  const entries = officialPreconCardEntries();

  it('lists every unique official precon card', () => {
    expect(entries.length).toBeGreaterThan(1000);
    expect(isGrammarEnabled()).toBe(false);
    // precons.json is official-only; sanity-check loadPrecons still reports 100/100
    for (const p of loadPrecons().filter(isOfficialPrecon)) {
      expect(p.supported, `${p.name}: ${p.unsupported.join(', ')}`).toBe(100);
    }
  });

  it('lift → validate → lower is lossless for every official precon card', () => {
    const invalid: string[] = [];
    const mismatches: string[] = [];
    for (const { name, card } of entries) {
      const cl = classify(card);
      const ir = liftCardDef(cl.def, { source: 'lift' });
      const v = validateCardScript(ir);
      if (!v.ok) invalid.push(`${name}: ${formatValidationErrors(v.errors)}`);
      const lowered = lowerCardScript(ir);
      const diff = diffCardDef(cl.def, lowered);
      if (diff.length) mismatches.push(`${name} [${cl.support}]: ${diff.join(' | ')}`);
    }
    expect(invalid, `invalid IR (${invalid.length})\n${invalid.slice(0, 15).join('\n')}`).toEqual([]);
    expect(mismatches, `lossless failures (${mismatches.length})\n${mismatches.slice(0, 15).join('\n')}`).toEqual([]);
  });

  it('grammar: true does not change classify() support or CardDef on official precon cards', () => {
    const changed: string[] = [];
    for (const { name, card } of entries) {
      const off = classify(card);
      const on = classify(card, { grammar: true });
      if (off.support !== on.support || !sameCardDef(off.def, on.def)) {
        const diff = diffCardDef(off.def, on.def);
        changed.push(`${name}: support ${off.support}→${on.support}${diff.length ? '; ' + diff.join(' | ') : ''}`);
      }
    }
    expect(changed, `flag-on changes (${changed.length})\n${changed.slice(0, 15).join('\n')}`).toEqual([]);
  });
});
