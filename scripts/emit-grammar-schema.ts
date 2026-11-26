import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { schemaJson } from '../src/engine/grammar/schema';

const dest = fileURLToPath(new URL('../src/engine/grammar/schema.json', import.meta.url));
writeFileSync(dest, schemaJson());
console.log('wrote', dest);
