/** Human-readable lift → validate → lower report over every official precon card. */
import { classify } from '../src/import/classify';
import { officialPreconCardEntries } from '../src/import/precons';
import { liftCardDef, lowerCardScript, validateCardScript, formatValidationErrors, diffCardDef } from '../src/engine/grammar';

const entries = officialPreconCardEntries();
let invalid = 0, mismatch = 0, ok = 0;
const samples: string[] = [];
for (const { name, card } of entries) {
  const cl = classify(card);
  const ir = liftCardDef(cl.def, { source: 'lift' });
  const v = validateCardScript(ir);
  if (!v.ok) {
    invalid++;
    if (samples.length < 20) samples.push(`INVALID ${name}: ${formatValidationErrors(v.errors)}`);
    continue;
  }
  const diff = diffCardDef(cl.def, lowerCardScript(ir));
  if (diff.length) {
    mismatch++;
    if (samples.length < 20) samples.push(`MISMATCH ${name} [${cl.support}]: ${diff.join(' | ')}`);
    continue;
  }
  ok++;
}
console.log('Grammar golden (lift → validate → lower)');
console.log(`Official precon unique cards: ${entries.length}`);
console.log(`Lossless and valid: ${ok}`);
console.log(`Invalid IR: ${invalid}`);
console.log(`Mismatches: ${mismatch}`);
if (samples.length) {
  console.log('Samples:');
  for (const s of samples) console.log('  ' + s);
}
if (invalid || mismatch) process.exit(1);
