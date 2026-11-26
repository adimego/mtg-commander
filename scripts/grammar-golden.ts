/** Human-readable grammar report: lift/lower plus parser-vs-old, over official precons and (if present) the supported Scryfall corpus. */
import fs from 'node:fs';
import { classify, compileScry, parseScry } from '../src/import/classify';
import { officialPreconCardEntries } from '../src/import/precons';
import type { ScryCard } from '../src/import/scryfall';
import {
  liftCardDef, lowerCardScript, validateCardScript, formatValidationErrors, diffCardDef, equivCardDef,
} from '../src/engine/grammar';
import { collectEffectKindSources, kindsMissingFromList } from '../src/engine/grammar/collect-kinds';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function kindCheck() {
  const oracleSrc = readFileSync(fileURLToPath(new URL('../src/engine/oracle.ts', import.meta.url)), 'utf8');
  const engineSrc = readFileSync(fileURLToPath(new URL('../src/engine/engine.ts', import.meta.url)), 'utf8');
  const { literals, execCases, union } = collectEffectKindSources(oracleSrc, engineSrc);
  const missing = kindsMissingFromList(oracleSrc, engineSrc);
  console.log(`Effect kinds: ${literals.length} compiler literals, ${execCases.length} exec() cases, union ${union.length}`);
  if (missing.length) {
    console.log(`  MISSING from EFFECT_KINDS: ${missing.join(', ')}`);
    return false;
  }
  console.log('  EFFECT_KINDS covers the union.');
  return true;
}

function compareSet(label: string, entries: { name: string; card: ScryCard }[]) {
  let invalid = 0, liftMismatch = 0, parseMismatch = 0, parseWorse = 0, parseOk = 0;
  const samples: string[] = [];
  const gapCounts = new Map<string, number>();
  const bump = (k: string) => gapCounts.set(k, (gapCounts.get(k) ?? 0) + 1);
  for (const { name, card } of entries) {
    const cl = classify(card);
    const ir = liftCardDef(cl.def, { source: 'lift' });
    const v = validateCardScript(ir);
    if (!v.ok) {
      invalid++;
      if (samples.length < 25) samples.push(`INVALID ${name}: ${formatValidationErrors(v.errors)}`);
    }
    const liftDiff = diffCardDef(cl.def, lowerCardScript(ir));
    if (liftDiff.length) {
      liftMismatch++;
      if (samples.length < 25) samples.push(`LIFT ${name}: ${liftDiff.join(' | ')}`);
    }
    const old = compileScry(card);
    const parsed = parseScry(card);
    if (old.support === 'auto' && parsed.support !== 'auto') {
      parseWorse++;
      bump((parsed.failures ?? []).map(f => f.production ?? 'line').join('+') || 'unparsed');
      if (samples.length < 25) samples.push(`WORSE ${name}: ${parsed.failures?.map(f => `${f.production}@${f.line}: ${f.reason}`).join('; ') || parsed.unparsed?.join(' / ')}`);
    }
    if (!equivCardDef(old.def, parsed.def)) {
      parseMismatch++;
      const prod = parsed.failures?.[0]?.production ?? 'shape';
      bump(prod);
      if (samples.length < 25) samples.push(`MISMATCH ${name} [old ${old.support} / parse ${parsed.support}]: ${diffCardDef(old.def, parsed.def).join(' | ')}`);
    } else {
      parseOk++;
    }
  }
  console.log(`${label}`);
  console.log(`  Cards: ${entries.length}`);
  console.log(`  Lift/lower valid and lossless: ${entries.length - invalid - liftMismatch}/${entries.length}`);
  console.log(`  Parser ≡ old compileScry: ${parseOk}/${entries.length}`);
  console.log(`  Parser mismatches: ${parseMismatch}`);
  console.log(`  Parser lost auto: ${parseWorse}`);
  if (gapCounts.size) {
    const top = [...gapCounts].sort((a, b) => b[1] - a[1]).slice(0, 15);
    console.log('  Top remaining parity gaps (by tag):');
    for (const [k, n] of top) console.log(`    ${String(n).padStart(5)}  ${k}`);
  }
  if (samples.length) {
    console.log('  Samples:');
    for (const s of samples) console.log('    ' + s);
  }
  return { total: entries.length, parseOk, parseMismatch, parseWorse, invalid, liftMismatch };
}

function loadBulk(): ScryCard[] | null {
  const paths = [
    '/tmp/oracle-cards-bulk.json',
    fileURLToPath(new URL('../.cache/oracle-cards.json', import.meta.url)),
  ];
  const p = paths.find(x => fs.existsSync(x));
  if (!p) { console.log('No Scryfall Oracle Cards bulk at /tmp/oracle-cards-bulk.json or .cache/oracle-cards.json — skipping corpus.'); return null; }
  console.log('Loading corpus from', p);
  const raw = fs.readFileSync(p, 'utf8').trim();
  const all = raw.startsWith('[') ? JSON.parse(raw) : raw.split('\n').map((l: string) => l.trim().replace(/,$/, '')).filter((l: string) => l.startsWith('{')).map((l: string) => JSON.parse(l));
  return all.filter((c: ScryCard) => !c.legalities || c.legalities.commander === 'legal');
}

const kindsOk = kindCheck();
const precon = compareSet('Official precon unique cards', officialPreconCardEntries());

const bulk = loadBulk();
let corpus: ReturnType<typeof compareSet> | undefined;
if (bulk) {
  const supported: { name: string; card: ScryCard }[] = [];
  const seen = new Set<string>();
  for (const c of bulk) {
    const key = (c as ScryCard & { oracle_id?: string }).oracle_id ?? c.name;
    if (seen.has(key)) continue;
    const cl = classify(c);
    if (cl.support === 'auto' || cl.support === 'builtin') {
      seen.add(key);
      supported.push({ name: c.name, card: c });
    }
  }
  corpus = compareSet('Supported commander-legal corpus (classify auto+builtin, unique oracle_id)', supported);
}

if (!kindsOk || precon.parseMismatch || precon.parseWorse || precon.invalid || precon.liftMismatch) process.exitCode = 1;
if (corpus && (corpus.parseMismatch || corpus.parseWorse || corpus.invalid || corpus.liftMismatch)) process.exitCode = 1;
