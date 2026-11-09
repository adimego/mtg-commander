// Builds src/data/precons.json from Wizards' official decklist page (saved in scripts/data) + Scryfall card data.
// Usage: node scripts/fetch-precons.mjs  (re-download the page with curl first to refresh)
import { readFileSync, writeFileSync } from 'node:fs';
const SETS = [
  { file: 'scripts/data/msc-decklists.html', set: 'MSC', setName: 'Marvel Super Heroes Commander', ncmd: { 'The Fantastic Four': 4 } },
  { file: 'scripts/data/frc-decklist.html', set: 'FRC', setName: 'Reality Fracture Commander', ncmd: { 'Multiverse Reforged': 2 } },
];
const un = s => s.replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function collection(names) {
  const out = new Map();
  for (let i = 0; i < names.length; i += 70) {
    const r = await fetch('https://api.scryfall.com/cards/collection', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'mtg-commander/1.0', Accept: 'application/json' }, body: JSON.stringify({ identifiers: names.slice(i, i + 70).map(name => ({ name })) }) });
    const j = await r.json(); for (const c of j.data) out.set(c.name, c); for (const n of j.not_found ?? []) out.set('?' + n.name, null); await sleep(150);
  }
  return out;
}
const keep = c => ({ name: c.name, mana_cost: c.mana_cost, type_line: c.type_line, oracle_text: c.oracle_text, power: c.power, toughness: c.toughness, loyalty: c.loyalty, colors: c.colors, color_identity: c.color_identity, keywords: c.keywords, layout: c.layout, produced_mana: c.produced_mana,
  image_uris: c.image_uris && { normal: c.image_uris.normal, art_crop: c.image_uris.art_crop }, card_faces: c.card_faces?.map(f => ({ name: f.name, mana_cost: f.mana_cost, type_line: f.type_line, oracle_text: f.oracle_text, power: f.power, toughness: f.toughness, loyalty: f.loyalty, colors: f.colors, image_uris: f.image_uris && { normal: f.image_uris.normal, art_crop: f.image_uris.art_crop } })) });
const decks = []; const cards = {};
for (const S of SETS) {
  const html = readFileSync(S.file, 'utf8');
  for (const m of html.matchAll(/<deck-list[^>]*deck-title="([^"]+)"[^>]*>([\s\S]*?)<\/deck-list>/g)) {
    const title = un(m[1]); const main = /<main-deck>([\s\S]*?)<\/main-deck>/.exec(m[2])[1];
    const lines = main.split('\n').map(l => un(l.trim())).filter(Boolean).map(l => { const q = /^(\d+) (.+)$/.exec(l); return q ? { q: +q[1], name: q[2] } : { q: 1, name: l }; });
    decks.push({ id: 'precon-' + S.set.toLowerCase() + '-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: title, set: S.set, setName: S.setName, ncmd: S.ncmd[title] ?? 1, lines });
  }
}
let names = [...new Set(decks.flatMap(d => d.lines.map(l => l.name)))];
let found = await collection(names);
// Variant-art printings are listed as "<card> <variant>" (e.g. "Sol Ring Avengers"): drop trailing words until Scryfall knows the name
const fix = {};
for (const n of names) if (found.get('?' + n) === null) { const w = n.split(' '); for (let k = w.length - 1; k > 0; k--) { const t = w.slice(0, k).join(' ').replace(/ \($/, ''); const r = await collection([t]); const c = [...r.values()].find(Boolean); if (c) { fix[n] = c.name; found.set(c.name, c); break; } } if (!fix[n]) throw new Error('not found: ' + n); }
for (const d of decks) for (const l of d.lines) { l.name = fix[l.name] ?? l.name; const c = found.get(l.name) ?? [...found.values()].find(x => x && x.name.split(' // ')[0] === l.name); if (!c) throw new Error('missing ' + l.name); l.name = c.name; cards[c.name] = keep(c); }
for (const d of decks) { const n = d.lines.reduce((s, l) => s + l.q, 0); if (n !== 100) throw new Error(`${d.name}: ${n} cards`); }
writeFileSync('src/data/precons.json', JSON.stringify({ decks: decks.map(d => ({ id: d.id, name: d.name, set: d.set, setName: d.setName, commanders: d.lines.slice(0, d.ncmd).map(l => l.name), cards: d.lines.slice(d.ncmd) })), cards }));
console.log(decks.map(d => `${d.name}: ${d.lines.slice(0, d.ncmd).map(l => l.name).join(' + ')}`).join('\n'), '\nfixed', fix, '\ncards', Object.keys(cards).length);
