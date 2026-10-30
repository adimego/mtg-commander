// Ranks planeswalker compile failures by popularity-weighted impact.
import fs from 'node:fs';
import { compileScry } from '../src/import/classify';
const all = JSON.parse(fs.readFileSync(process.argv[2] ?? '/workspace/bulk/slim.json', 'utf8'));
const pws = all.filter((c: any) => /Planeswalker/.test(c.type_line ?? c.card_faces?.[0]?.type_line ?? '')).sort((a: any, b: any) => (a.edhrec_rank ?? 1e9) - (b.edhrec_rank ?? 1e9));
const norm = (c: any, u: string) => u.replace(new RegExp(c.name.split(' // ')[0].split(',')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^.:]*?(?=( deals| gets|\\b))', 'gi'), '~').toLowerCase().replace(/\d+/g, 'N');
const clauses: Record<string, { n: number; w: number; cards: string[] }> = {};
let ok = 0; const rows: string[] = [];
pws.forEach((c: any, i: number) => {
  const r = compileScry(c); const pass = r.support === 'auto'; if (pass) ok++;
  const u = r.unparsed ?? [];
  rows.push(`${i + 1}. ${c.name} (#${c.edhrec_rank ?? '-'}) ${pass ? 'OK' : 'FAIL: ' + (u.map(x => x.slice(0, 120)).join(' | ') || r.reason)}`);
  if (!pass) for (const x of u) { const k = norm(c, x).slice(0, 160); const e = clauses[k] ??= { n: 0, w: 0, cards: [] }; e.n++; e.w += i < 100 ? 3 : 1; e.cards.push(c.name); }
});
console.log(`walkers ${ok}/${pws.length}`);
if (process.argv.includes('--rank')) for (const [k, v] of Object.entries(clauses).sort((a, b) => b[1].w - a[1].w).slice(0, +(process.argv[4] ?? 60))) console.log(v.w, v.n, k, '::', v.cards.slice(0, 3).join('; '));
if (process.argv.includes('--list')) console.log(rows.join('\n'));
