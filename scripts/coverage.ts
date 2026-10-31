/** Coverage report for the Oracle-text compiler.
 *  Usage: npx vite-node scripts/coverage.ts [path/to/oracle-cards.json(l)] [--write] [--fails N]
 *  Downloads Scryfall's "Oracle Cards" bulk file once (cached in .cache/) unless a path is given. */
import fs from 'node:fs'; import zlib from 'node:zlib';
import { compileScry } from '../src/import/classify';
import { normalize } from '../src/engine/oracle';
import type { ScryCard } from '../src/import/scryfall';

const args = process.argv.slice(2);
async function load(): Promise<(ScryCard & { edhrec_rank?: number; legalities?: Record<string, string> })[]> {
  let p = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a));
  if (!p) {
    p = '.cache/oracle-cards.json';
    if (!fs.existsSync(p)) {
      fs.mkdirSync('.cache', { recursive: true });
      const meta = await (await fetch('https://api.scryfall.com/bulk-data/oracle-cards', { headers: { 'User-Agent': 'mtg-commander-coverage/1.0', Accept: 'application/json' } })).json();
      const url = meta.download_uri ?? meta.jsonl_download_uri; console.error('downloading', url);
      let buf = Buffer.from(await (await fetch(url)).arrayBuffer()); if (buf[0] === 0x1f) buf = zlib.gunzipSync(buf);
      fs.writeFileSync(p, buf);
    }
  }
  const raw = fs.readFileSync(p, 'utf8').trim();
  const all = raw.startsWith('[') ? JSON.parse(raw) : raw.split('\n').map(l => l.trim().replace(/,$/, '')).filter(l => l.startsWith('{')).map(l => JSON.parse(l));
  return all.filter((c: { legalities?: Record<string, string> }) => !c.legalities || c.legalities.commander === 'legal');
}
const cards = await load();
let full = 0; const fails = new Map<string, number>(); const rows: { name: string; ok: boolean; rank?: number; pw?: boolean; why?: string }[] = [];
const byType: Record<string, [number, number]> = {};
for (const c of cards) {
  let r; try { r = compileScry(c); } catch (e) { r = { support: 'limited', unparsed: [`CRASH ${(e as Error).message}`] }; }
  const ok = r.support === 'auto'; if (ok) full++;
  rows.push({ name: c.name, ok, rank: c.edhrec_rank, pw: (c.type_line.split('—')[0].match(/Creature|Planeswalker|Instant|Sorcery|Artifact|Enchantment|Land|Battle/) ?? [''])[0] === 'Planeswalker', why: ok ? '' : ((r as { unparsed?: string[] }).unparsed ?? []).join(' / ') || (r as { reason?: string }).reason || '' });
  const t = (c.type_line.split('—')[0].match(/Creature|Planeswalker|Instant|Sorcery|Artifact|Enchantment|Land|Battle/) ?? ['Other'])[0];
  (byType[t] ??= [0, 0])[1]++; if (ok) byType[t][0]++;
  for (const u of (r as { unparsed?: string[] }).unparsed ?? []) { const k = u.replace(/\d+/g, 'N').replace(/\{[^}]+\}/g, '{M}').slice(0, 110); fails.set(k, (fails.get(k) ?? 0) + 1); }
}
const top = rows.filter(r => r.rank !== undefined).sort((a, b) => a.rank! - b.rank!).slice(0, 500);
const topOk = top.filter(r => r.ok).length;
const pws = rows.filter(r => r.pw); const pwOk = pws.filter(r => r.ok).length;
const pwTop = pws.filter(r => r.rank !== undefined).sort((a, b) => a.rank! - b.rank!).slice(0, 20);
/** Hand-maintained milestones for the planeswalker push (numbers from this script at the time). */
const PW_HISTORY: [string, string, string, string][] = [
  ['Oct 30 2026, before planeswalker batch 2', '40/296', '10577 (32.9%)', '317/500'],
  ['Oct 30 2026, before planeswalker batch 3', '77/296', '10918 (34.0%)', '319/500'],
];
const pct = (a: number, b: number) => `${(100 * a / b).toFixed(1)}%`;
console.log(`Commander-legal cards: ${cards.length}`);
console.log(`Fully supported: ${full} (${pct(full, cards.length)})`);
console.log(`Top 500 by EDHREC rank: ${topOk}/500 (${pct(topOk, 500)})`);
for (const [t, [a, b]] of Object.entries(byType).sort((x, y) => y[1][1] - x[1][1])) console.log(`  ${t.padEnd(13)} ${a}/${b} ${pct(a, b)}`);
const nf = +(args[args.indexOf('--fails') + 1] ?? 0) || 40;
if (args.includes('--fails')) { console.log('\nMost common unparsed lines:'); for (const [k, v] of [...fails].sort((a, b) => b[1] - a[1]).slice(0, nf)) console.log(String(v).padStart(5), k); }
if (args.includes('--topfails')) { console.log('\nTop-500 unsupported:'); for (const r of top.filter(r => !r.ok)) { const c = cards.find(x => x.name === r.name)!; const res = compileScry(c); console.log(`#${r.rank} ${r.name}: ${(res.unparsed ?? []).join(' | ') || res.reason}`); } }
if (args.includes('--write')) {
  const date = new Date().toISOString().slice(0, 10);
  const md = `# Ability coverage\n\nGenerated ${date} by \`npx vite-node scripts/coverage.ts --write\` from Scryfall's Oracle Cards bulk data (Commander-legal cards only).\n\nA card counts as **fully supported** only if *every* line of its rules text compiled into the engine's ability system, its mana cost parsed exactly, and it is a normal single-faced card (multi-face cards, sagas and vehicles are always \`Limited\`). Everything else is badged **Limited** in game; the lines that did compile still work.\n\n| Set | Fully supported |\n|---|---|\n| All Commander-legal cards (${cards.length}) | **${full} (${pct(full, cards.length)})** |\n| Top 500 by EDHREC rank | **${topOk}/500 (${pct(topOk, 500)})** |\n${Object.entries(byType).sort((x, y) => y[1][1] - x[1][1]).map(([t, [a, b]]) => `| ${t} (${b}) | ${a} (${pct(a, b)}) |`).join('\n')}\n\n## Planeswalkers\n\n| When | Planeswalkers fully supported | All cards | Top 500 |\n|---|---|---|---|\n${PW_HISTORY.map(h => `| ${h.join(' | ')} |`).join('\n')}\n| Now (${date}) | **${pwOk}/${pws.length}** | ${full} (${pct(full, cards.length)}) | ${topOk}/500 |\n\nThe 20 most popular planeswalkers (EDHREC rank):\n\n| # | Planeswalker | Status | What is still missing |\n|---|---|---|---|\n${pwTop.map(r => `| ${r.rank} | ${r.name} | ${r.ok ? 'Full' : 'Limited'} | ${r.ok ? '' : (r.why ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 160)} |`).join('\n')}\n\n## Most common unsupported rules lines\n\n| Cards | Line (numbers → N, mana → {M}) |\n|---|---|\n${[...fails].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `| ${v} | ${k.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`).join('\n')}\n\n## Top-500 cards that are still Limited\n\n${top.filter(r => !r.ok).map(r => `#${r.rank} ${r.name}`).join(', ')}\n`;
  fs.mkdirSync('docs', { recursive: true }); const old = fs.existsSync('docs/coverage.md') ? fs.readFileSync('docs/coverage.md', 'utf8') : ''; const bs = old.indexOf('\n## By set'); fs.writeFileSync('docs/coverage.md', bs >= 0 ? md.trimEnd() + '\n' + old.slice(bs) : md); console.log('wrote docs/coverage.md');
}
void normalize;
