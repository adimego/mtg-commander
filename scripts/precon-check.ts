/** Prints supported/total per built-in precon with each unsupported card's unparsed text. Usage: npx vite-node scripts/precon-check.ts */
import { classify as compileScry } from '../src/import/classify';
import P from '../src/data/precons.json';
for (const d of (P as any).decks) {
  let ok = 0, n = 0; const bad: string[] = [];
  for (const l of [...d.commanders.map((name: string) => ({ q: 1, name })), ...d.cards]) { n += l.q; const r = compileScry((P as any).cards[l.name]); if (r.support !== 'limited') ok += l.q; else bad.push(`${l.name}: ${JSON.stringify(r.unparsed ?? r.reason).slice(0, 400)}`); }
  console.log(`== ${d.name} [${d.commanders.join(' + ')}] ${ok}/${n}`); for (const b of bad) console.log('  ' + b);
}
