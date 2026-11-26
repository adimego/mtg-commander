// Builds src/data/precons.json from Wizards' official decklist page (saved in scripts/data) + Scryfall card data.
// Usage: node scripts/fetch-precons.mjs  (re-download the page with curl first to refresh)
import { readFileSync, writeFileSync } from 'node:fs';
const SETS = [
  { file: 'scripts/data/msc-decklists.html', set: 'MSC', setName: 'Marvel Super Heroes Commander', released: '2026-06-26', ncmd: { 'The Fantastic Four': 4 } },
  { file: 'scripts/data/frc-decklist.html', set: 'FRC', setName: 'Reality Fracture Commander', released: '2026-10-02', ncmd: { 'Multiverse Reforged': 2 } },
  { file: 'scripts/data/trc-decklists.html', set: 'TRC', setName: 'Star Trek Commander', released: '2026-11-13', ncmd: { 'Federation Fleet': 2, 'Landing Party': 2, 'Klingon Fury': 2, 'We Are the Borg': 2 } },
  { file: 'scripts/data/soc-decklists.html', set: 'SOC', setName: 'Secrets of Strixhaven Commander', released: '2026-04-24', ncmd: { 'Silverquill Influence': 2, 'Prismari Artistry': 2, 'Witherbloom Pestilence': 2, 'Lorehold Spirit': 2, 'Quandrix Unlimited': 2 } },
  { file: 'scripts/data/fic-decklists.html', set: 'FIC', setName: 'Final Fantasy Commander', released: '2025-06-13', ncmd: { 'Revival Trance': 2, 'Limit Break': 2, 'Counter Blitz': 2, 'Scions & Spellcraft': 2 } },
  { file: 'scripts/data/ecc-decklists.html', set: 'ECC', setName: 'Lorwyn Eclipsed Commander', released: '2026-01-23', ncmd: { 'Dance of the Elements': 2, 'Blight Curse': 2 } },
  { file: 'scripts/data/eoc-decklists.html', set: 'EOC', setName: 'Edge of Eternities Commander', released: '2025-08-01', ncmd: { 'World Shaper': 2, 'Counter Intelligence': 2 } },
];
const un = s => s.replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const cleanName = s => un(s).replace(/\s+\[[^\]]+\]\s*$/, '').trim();
const shortTitle = t => { const m = /^(.+?) \((FINAL FANTASY [IVXLCDM]+)\)$/.exec(t); return m ? { name: m[1], subtitle: m[2] } : { name: t }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function collection(names) {
  const out = new Map();
  for (let i = 0; i < names.length; i += 70) {
    let j, tries = 0;
    while (true) {
      const r = await fetch('https://api.scryfall.com/cards/collection', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'mtg-commander/1.0', Accept: 'application/json' }, body: JSON.stringify({ identifiers: names.slice(i, i + 70).map(name => ({ name })) }) });
      j = await r.json();
      if (Array.isArray(j.data)) break;
      if (++tries >= 8) throw new Error('Scryfall collection failed: ' + JSON.stringify(j).slice(0, 400));
      const wait = j.details && /60 seconds/.test(j.details) ? 65000 : 800 * tries; console.warn("Scryfall retry", tries, "waiting", wait); await sleep(wait);
    }
    for (const c of j.data) out.set(c.name, c); for (const n of j.not_found ?? []) out.set('?' + n.name, null); await sleep(200);
  }
  return out;
}
const keep = c => ({ name: c.name, mana_cost: c.mana_cost, type_line: c.type_line, oracle_text: c.oracle_text, power: c.power, toughness: c.toughness, loyalty: c.loyalty, colors: c.colors, color_identity: c.color_identity, keywords: c.keywords, layout: c.layout, produced_mana: c.produced_mana,
  image_uris: c.image_uris && { normal: c.image_uris.normal, art_crop: c.image_uris.art_crop }, card_faces: c.card_faces?.map(f => ({ name: f.name, mana_cost: f.mana_cost, type_line: f.type_line, oracle_text: f.oracle_text, power: f.power, toughness: f.toughness, loyalty: f.loyalty, colors: f.colors, image_uris: f.image_uris && { normal: f.image_uris.normal, art_crop: f.image_uris.art_crop } })) });
const decks = []; const cards = {};
for (const S of SETS) {
  const html = readFileSync(S.file, 'utf8');
  for (const m of html.matchAll(/<deck-list[^>]*deck-title="([^"]+)"[^>]*>([\s\S]*?)<\/deck-list>/g)) {
    const rawTitle = un(m[1]); const { name: title, subtitle } = shortTitle(rawTitle); const main = /<main-deck>([\s\S]*?)<\/main-deck>/.exec(m[2])[1];
    const lines = main.split('\n').map(l => cleanName(l.trim())).filter(Boolean).map(l => { const q = /^(\d+) (.+)$/.exec(l); return q ? { q: +q[1], name: q[2] } : { q: 1, name: l }; });
    decks.push({ id: 'precon-' + S.set.toLowerCase() + '-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: title, subtitle, set: S.set, setName: S.setName, released: S.released, ncmd: S.ncmd[title] ?? 1, lines });
  }
}
let names = [...new Set(decks.flatMap(d => d.lines.map(l => l.name)))];
let found = await collection(names);
// Variant-art printings are listed as "<card> <variant>" (e.g. "Sol Ring Avengers"): drop trailing words until Scryfall knows the name
const fix = {};
for (const n of names) if (found.get('?' + n) === null) { const w = n.split(' '); for (let k = w.length - 1; k > 0; k--) { const t = w.slice(0, k).join(' ').replace(/ \($/, ''); const r = await collection([t]); const c = [...r.values()].find(Boolean); if (c) { fix[n] = c.name; found.set(c.name, c); break; } } if (!fix[n]) throw new Error('not found: ' + n); }
for (const d of decks) for (const l of d.lines) { l.name = fix[l.name] ?? l.name; const c = found.get(l.name) ?? [...found.values()].find(x => x && x.name.split(' // ')[0] === l.name); if (!c) throw new Error('missing ' + l.name); l.name = c.name; cards[c.name] = keep(c); }
for (const d of decks) { const n = d.lines.reduce((s, l) => s + l.q, 0); if (n !== 100) throw new Error(`${d.name}: ${n} cards`); }
writeFileSync('src/data/precons.json', JSON.stringify({ decks: decks.map(d => ({ id: d.id, name: d.name, ...(d.subtitle ? { subtitle: d.subtitle } : {}), set: d.set, setName: d.setName, released: d.released, commanders: d.lines.slice(0, d.ncmd).map(l => l.name), cards: d.lines.slice(d.ncmd) })), cards }));
console.log(decks.map(d => `${d.name}: ${d.lines.slice(0, d.ncmd).map(l => l.name).join(' + ')}`).join('\n'), '\nfixed', fix, '\ncards', Object.keys(cards).length);
