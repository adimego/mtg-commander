import { describe, it, expect, afterEach } from 'vitest';
import { classify, compileScry, parseScry } from '../src/import/classify';
import { officialPreconCardEntries, isOfficialPrecon, loadPrecons } from '../src/import/precons';
import {
  liftCardDef, lowerCardScript, validateCardScript, formatValidationErrors,
  diffCardDef, sameCardDef, equivCardDef, setGrammarEnabled, isGrammarEnabled,
} from '../src/engine/grammar';

afterEach(() => setGrammarEnabled(true));

describe('grammar golden: official precons', () => {
  const entries = officialPreconCardEntries();

  it('lists every unique official precon card', () => {
    expect(entries.length).toBeGreaterThan(1000);
    expect(isGrammarEnabled()).toBe(true);
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

  it('default-on classify with fallback does not change official precon support or CardDef vs the old compiler', () => {
    const changed: string[] = [];
    for (const { name, card } of entries) {
      const off = classify(card, { grammar: false });
      const on = classify(card);
      if (off.support !== on.support || !sameCardDef(off.def, on.def)) {
        const diff = diffCardDef(off.def, on.def);
        changed.push(`${name}: support ${off.support}→${on.support}${diff.length ? '; ' + diff.join(' | ') : ''}`);
      }
    }
    expect(changed, `flag-on changes (${changed.length})\n${changed.slice(0, 15).join('\n')}`).toEqual([]);
  });

  it('parser vs old compileScry is equivalent for every official precon card', () => {
    const mismatches: string[] = [];
    const worse: string[] = [];
    for (const { name, card } of entries) {
      const old = compileScry(card, { grammar: false });
      const parsed = parseScry(card);
      if (old.support === 'auto' && parsed.support !== 'auto') {
        const fails = (parsed.failures ?? []).map(f => `${f.production ?? 'line'}@${f.line}: ${f.reason}`).join('; ')
          || (parsed.unparsed ?? []).join(' / ');
        worse.push(`${name}: old auto, parser ${parsed.support} (${fails})`);
      }
      if (!equivCardDef(old.def, parsed.def)) {
        const diff = diffCardDef(old.def, parsed.def);
        mismatches.push(`${name} [old ${old.support} / parse ${parsed.support}]: ${diff.join(' | ')}`);
      }
    }
    expect(worse, `parser lost auto support (${worse.length})\n${worse.slice(0, 15).join('\n')}`).toEqual([]);
    expect(mismatches, `parser mismatches (${mismatches.length})\n${mismatches.slice(0, 15).join('\n')}`).toEqual([]);
  });

  it('flag on with fallback does not change compileScry on official precon cards', () => {
    const changed: string[] = [];
    for (const { name, card } of entries) {
      const off = compileScry(card, { grammar: false });
      const on = compileScry(card, { grammar: true, fallback: true });
      if (off.support !== on.support || !equivCardDef(off.def, on.def)) {
        changed.push(`${name}: ${off.support}→${on.support}`);
      }
    }
    expect(changed, `flag-on+fallback changes (${changed.length})\n${changed.slice(0, 15).join('\n')}`).toEqual([]);
  });

});
