// Builds src/data/cards.json + decks.json from the Scryfall API (real cards the engine can model exactly).
// Run: npm run fetch:cards   (≈40 requests, rate-limited to ~8/s with a User-Agent, per Scryfall guidance)
import { writeFileSync } from 'node:fs';
import { get, search, onlyKeywords, simpleCost, UA } from './scry.mjs';

const DECKS = [
  { id: 'tobias', name: 'Azorius Wings (WU)', commander: 'Tobias Andrion', colors: ['W', 'U'] },
  { id: 'barktooth', name: 'Rakdos Raiders (BR)', commander: 'Barktooth Warbeard', colors: ['B', 'R'] },
  { id: 'lady', name: 'Gruul Mountainside (RG)', commander: 'The Lady of the Mountain', colors: ['R', 'G'] },
  { id: 'jasmine', name: 'Selesnya Grove (GW)', commander: 'Jasmine Boreal', colors: ['G', 'W'] },
];
// Spells whose real Oracle text matches an effect the engine implements exactly.
const SPELLS = {
  'Sacred Nectar': ['gainLife', 4], "Angel's Mercy": ['gainLife', 7], 'Glorious Anthem': ['anthem', 1],
  'Divination': ['draw', 2], 'Concentrate': ['draw', 3], 'Tidings': ['draw', 4],
  'Murder': ['destroyCreature', 0], 'Eviscerate': ['destroyCreature', 0], 'Blood Tithe': ['drainOpponents', 3],
  'Lightning Bolt': ['damageAny', 3], 'Lightning Strike': ['damageAny', 3], 'Searing Spear': ['damageAny', 3], 'Brute Force': ['pump', 3],
  'Giant Growth': ['pump', 3], 'Titanic Growth': ['pump', 4], 'Rampant Growth': ['rampLand', 1], 'Explosive Vegetation': ['rampLand', 2], 'Harmonize': ['draw', 3], "Gaea's Anthem": ['anthem', 1],
};
const ROCKS = { 'Arcane Signet': ['ANY'] };
const LANDS = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G', 'Command Tower': 'ANY' };
const BASIC = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
const CURVE = { 1: 4, 2: 10, 3: 12, 4: 10, 5: 8, 6: 4, 7: 2 }; // 50 creatures

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function parseCost(mc) { const cost = { generic: 0 }; for (const [, s] of (mc || '').matchAll(/\{([^}]+)\}/g)) { if (/^\d+$/.test(s)) cost.generic += +s; else if (s === 'C') cost.generic += 1; else cost[s] = (cost[s] || 0) + 1; } return cost; }

const picks = {}; // deck id -> creature names
for (const d of DECKS) {
  const id = d.colors.join('').toLowerCase();
  const res = (await search(`t:creature -t:legendary -t:land legal:commander game:paper id<=${id} (is:vanilla or is:frenchvanilla)`, 6))
    .filter(c => onlyKeywords(c) && simpleCost(c) && /^\d+$/.test(c.power) && /^\d+$/.test(c.toughness) && c.cmc >= 1 && c.cmc <= 7);
  const left = { ...CURVE }; picks[d.id] = [];
  for (const c of res) if (left[c.cmc] > 0) { left[c.cmc]--; picks[d.id].push(c.name); }
  console.log(d.id, picks[d.id].length, 'creatures from', res.length, 'candidates');
}
// Final data via /cards/collection (75 identifiers per request).
const names = [...new Set([...Object.values(picks).flat(), ...DECKS.map(d => d.commander), ...Object.keys(SPELLS), ...Object.keys(ROCKS), ...Object.keys(LANDS)])];
const cards = [];
for (let i = 0; i < names.length; i += 75) {
  const r = await get('https://api.scryfall.com/cards/collection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiers: names.slice(i, i + 75).map(name => ({ name })) }) });
  if (r.not_found?.length) console.warn('not found', r.not_found);
  cards.push(...r.data);
}
const out = cards.map(c => {
  const types = c.type_line.split('—')[0].trim().split(/\s+/).filter(t => !['Legendary', 'Basic'].includes(t));
  const o = { id: slug(c.name), name: c.name, types, cost: parseCost(c.mana_cost), colors: c.colors, typeLine: c.type_line, text: c.oracle_text || '', img: c.image_uris.normal, art: c.image_uris.art_crop, scryfall: c.scryfall_uri };
  if (c.type_line.includes('Legendary')) o.legendary = true;
  if (c.type_line.includes('Basic')) o.basic = true;
  if (types.includes('Creature')) { o.power = +c.power; o.toughness = +c.toughness; o.keywords = c.keywords.map(k => k.toLowerCase()); }
  if (SPELLS[c.name]) o.effect = { kind: SPELLS[c.name][0], amount: SPELLS[c.name][1] };
  if (ROCKS[c.name]) o.produces = ROCKS[c.name];
  if (LANDS[c.name]) o.produces = [LANDS[c.name]];
  return o;
});
const byName = Object.fromEntries(out.map(c => [c.name, c]));
const decks = DECKS.map(d => {
  const ok = c => c.colors.every(k => d.colors.includes(k)) && Object.keys(c.cost).every(k => k === 'generic' || d.colors.includes(k));
  const spells = Object.keys(SPELLS).map(n => byName[n]).filter(ok).map(c => c.id);
  const list = [...picks[d.id].map(n => byName[n].id), ...spells, 'arcane-signet', 'command-tower'];
  for (let i = 0; list.length < 99; i++) list.push(slug(BASIC[d.colors[i % 2]]));
  return { id: d.id, name: d.name, commander: slug(d.commander), cards: list };
});
writeFileSync(new URL('../src/data/cards.json', import.meta.url), JSON.stringify(out, null, 1));
writeFileSync(new URL('../src/data/decks.json', import.meta.url), JSON.stringify(decks, null, 1));
console.log(out.length, 'cards;', decks.map(d => `${d.name}: ${d.cards.length + 1} (${d.cards.filter(x => ['plains', 'island', 'swamp', 'mountain', 'forest'].includes(x)).length} basics)`).join('; '));
void UA;
