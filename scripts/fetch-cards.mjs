// Builds src/data/cards.json + decks.json from the Scryfall API.
// Only real cards whose Oracle text the engine implements exactly. Abilities are declared here as data (see SPEC).
// Run: npm run fetch:cards   (rate-limited ~8 req/s, User-Agent set, final data via /cards/collection batches)
import { writeFileSync } from 'node:fs';
import { get, search, onlyKeywords, simpleCost } from './scry.mjs';

const DECKS = [
  { id: 'isperia', name: 'Azorius Tribunal (WU)', commander: 'Isperia, Supreme Judge', colors: ['W', 'U'] },
  { id: 'judith', name: 'Rakdos Scourge (BR)', commander: 'Judith, the Scourge Diva', colors: ['B', 'R'] },
  { id: 'ruric', name: 'Gruul Unbowed (RG)', commander: 'Ruric Thar, the Unbowed', colors: ['R', 'G'] },
  { id: 'benton', name: 'Selesnya Intelligence (GW)', commander: 'Sergeant John Benton', colors: ['G', 'W'] },
];
const draw = n => ({ op: 'draw', n });
const dmg = n => ({ op: 'damage', n });
const counter = target => ({ spell: { target, effects: [{ op: 'counter' }] } });
const SPEC = {
  // colorless
  'Sol Ring': { mana: [{ add: ['C', 'C'] }] },
  'Arcane Signet': { mana: [{ add: ['IDENTITY'] }] },
  'Mind Stone': { mana: [{ add: ['C'] }], abilities: [{ label: 'Draw a card', mana: { generic: 1 }, tap: true, sac: true, effects: [draw(1)] }] },
  "Commander's Sphere": { mana: [{ add: ['IDENTITY'] }], abilities: [{ label: 'Draw a card', sac: true, effects: [draw(1)] }] },
  "Wayfarer's Bauble": { abilities: [{ label: 'Fetch basic land', mana: { generic: 2 }, tap: true, sac: true, effects: [{ op: 'searchBasic', n: 1 }] }] },
  'Burnished Hart': { abilities: [{ label: 'Fetch 2 basic lands', mana: { generic: 3 }, sac: true, effects: [{ op: 'searchBasic', n: 2 }] }] },
  'Solemn Simulacrum': { triggers: [{ on: 'etb', label: 'fetch a basic land', effects: [{ op: 'searchBasic', n: 1 }] }, { on: 'dies', label: 'draw a card', effects: [draw(1)] }] },
  'Perilous Myr': { triggers: [{ on: 'dies', label: '2 damage to any target', target: 'any', effects: [dmg(2)] }] },
  // white
  'Swords to Plowshares': { spell: { target: 'creature', effects: [{ op: 'exileGainPower' }] } },
  'Path to Exile': { spell: { target: 'creature', effects: [{ op: 'exilePath' }] } },
  'Wall of Omens': { triggers: [{ on: 'etb', label: 'draw a card', effects: [draw(1)] }] },
  'Fencing Ace': {},
  'Glorious Anthem': { static: { p: 1, t: 1 } },
  'Sacred Nectar': { spell: { effects: [{ op: 'gainLife', n: 4 }] } },
  // blue
  'Counterspell': counter('spell'), 'Cancel': counter('spell'), 'Negate': counter('noncreatureSpell'), 'Essence Scatter': counter('creatureSpell'),
  "Dovin's Veto": { ...counter('noncreatureSpell'), uncounterable: true },
  'Unsummon': { spell: { target: 'creature', effects: [{ op: 'bounce' }] } },
  "Man-o'-War": { triggers: [{ on: 'etb', label: 'bounce target creature', target: 'creature', effects: [{ op: 'bounce' }] }] },
  'Thieving Magpie': { triggers: [{ on: 'damageOpponent', label: 'draw a card', effects: [draw(1)] }] },
  'Divination': { spell: { effects: [draw(2)] } }, 'Concentrate': { spell: { effects: [draw(3)] } },
  // black
  'Murder': { spell: { target: 'creature', effects: [{ op: 'destroy' }] } },
  'Doom Blade': { spell: { target: 'nonblackCreature', effects: [{ op: 'destroy' }] } },
  'Go for the Throat': { spell: { target: 'nonartifactCreature', effects: [{ op: 'destroy' }] } },
  'Ravenous Chupacabra': { triggers: [{ on: 'etb', label: 'destroy target creature an opponent controls', target: 'oppCreature', effects: [{ op: 'destroy' }] }] },
  'Royal Assassin': { abilities: [{ label: 'Destroy target tapped creature', tap: true, target: 'tappedCreature', effects: [{ op: 'destroy' }] }] },
  'Phyrexian Arena': { triggers: [{ on: 'upkeep', label: 'draw a card, lose 1 life', effects: [draw(1), { op: 'loseLife', n: 1 }] }] },
  "Night's Whisper": { spell: { effects: [draw(2), { op: 'loseLife', n: 2 }] } },
  'Blood Tithe': { spell: { effects: [{ op: 'drain', n: 3 }] } },
  // red
  'Lightning Bolt': { spell: { target: 'any', effects: [dmg(3)] } }, 'Searing Spear': { spell: { target: 'any', effects: [dmg(3)] } }, 'Lightning Strike': { spell: { target: 'any', effects: [dmg(3)] } },
  'Flametongue Kavu': { triggers: [{ on: 'etb', label: '4 damage to target creature', target: 'creature', effects: [dmg(4)] }] },
  'Prodigal Pyromancer': { abilities: [{ label: '1 damage to any target', tap: true, target: 'any', effects: [dmg(1)] }] },
  'Monastery Swiftspear': {},
  'Guttersnipe': { triggers: [{ on: 'youCast', filter: 'instantSorcery', label: '2 damage to each opponent', effects: [{ op: 'damageEachOpp', n: 2 }] }] },
  'Seal of Fire': { abilities: [{ label: '2 damage to any target', sac: true, target: 'any', effects: [dmg(2)] }] },
  'Boggart Brute': {}, 'Ridgetop Raptor': {},
  'Brute Force': { spell: { target: 'creature', effects: [{ op: 'pump', n: 3, m: 3 }] } },
  // green
  'Llanowar Elves': { mana: [{ add: ['G'] }] }, 'Elvish Mystic': { mana: [{ add: ['G'] }] }, 'Fyndhorn Elves': { mana: [{ add: ['G'] }] },
  'Birds of Paradise': { mana: [{ add: ['ANY'] }] },
  'Sakura-Tribe Elder': { abilities: [{ label: 'Fetch basic land', sac: true, effects: [{ op: 'searchBasic', n: 1 }] }] },
  'Elvish Visionary': { triggers: [{ on: 'etb', label: 'draw a card', effects: [draw(1)] }] },
  'Llanowar Visionary': { mana: [{ add: ['G'] }], triggers: [{ on: 'etb', label: 'draw a card', effects: [draw(1)] }] },
  'Rampant Growth': { spell: { effects: [{ op: 'searchBasic', n: 1 }] } },
  'Cultivate': { spell: { effects: [{ op: 'searchBasic', n: 1 }, { op: 'searchBasic', n: 1, toHand: true }] } },
  "Kodama's Reach": { spell: { effects: [{ op: 'searchBasic', n: 1 }, { op: 'searchBasic', n: 1, toHand: true }] } },
  'Explosive Vegetation': { spell: { effects: [{ op: 'searchBasic', n: 2 }] } },
  'Harmonize': { spell: { effects: [draw(3)] } },
  'Giant Growth': { spell: { target: 'creature', effects: [{ op: 'pump', n: 3, m: 3 }] } },
  'Titanic Growth': { spell: { target: 'creature', effects: [{ op: 'pump', n: 4, m: 4 }] } },
  'Giant Spider': {}, 'Ambush Viper': {},
  'Owlbear Shepherd': { triggers: [{ on: 'endStep', cond: 'totalPower8', label: 'draw a card (total power 8+)', effects: [draw(1)] }] },
  'Drumhunter': { mana: [{ add: ['C'] }], triggers: [{ on: 'endStep', cond: 'power5', label: 'draw a card (power 5+ creature)', effects: [draw(1)] }] },
  "Gaea's Anthem": { static: { p: 1, t: 1 } },
  // commanders
  'Isperia, Supreme Judge': { triggers: [{ on: 'creatureAttacksYou', label: 'draw a card', effects: [draw(1)] }] },
  'Judith, the Scourge Diva': { static: { p: 1, t: 0, others: true }, triggers: [{ on: 'yourCreatureDies', label: '1 damage to any target', target: 'any', effects: [dmg(1)] }] },
  'Ruric Thar, the Unbowed': { mustAttack: true, triggers: [{ on: 'anyCastNoncreature', label: '6 damage to that player', effects: [{ op: 'damageEventPlayer', n: 6 }] }] },
  'Sergeant John Benton': { triggers: [{ on: 'combatDamagePlayer', label: 'you and that player each draw that many', effects: [{ op: 'drawEventAmount' }, { op: 'eventPlayerDrawsEventAmount' }] }] },
};
const LANDS = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G', 'Command Tower': 'IDENTITY' };
const BASIC = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
const NONLAND = 62;
const CURVE = { 1: 4, 2: 9, 3: 10, 4: 8, 5: 6, 6: 4, 7: 2 };

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function parseCost(mc) { const cost = { generic: 0 }; for (const [, s] of (mc || '').matchAll(/\{([^}]+)\}/g)) { if (/^\d+$/.test(s)) cost.generic += +s; else if (s === 'C') cost.generic += 1; else cost[s] = (cost[s] || 0) + 1; } return cost; }

const fill = {};
for (const d of DECKS) {
  const id = d.colors.join('').toLowerCase();
  fill[d.id] = (await search(`t:creature -t:legendary -t:land legal:commander game:paper id<=${id} (is:vanilla or is:frenchvanilla)`, 5))
    .filter(c => onlyKeywords(c) && simpleCost(c) && /^\d+$/.test(c.power) && /^\d+$/.test(c.toughness) && c.cmc >= 1 && c.cmc <= 7 && !SPEC[c.name] && !c.keywords.includes('Defender'));
}
const fillNames = Object.values(fill).flat().map(c => c.name);
const names = [...new Set([...Object.keys(SPEC), ...Object.keys(LANDS), ...fillNames])];
const cards = [];
for (let i = 0; i < names.length; i += 75) {
  const r = await get('https://api.scryfall.com/cards/collection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiers: names.slice(i, i + 75).map(name => ({ name })) }) });
  if (r.not_found?.length) console.warn('not found', r.not_found);
  cards.push(...r.data);
}
const out = cards.map(c => {
  const types = c.type_line.split('—')[0].trim().split(/\s+/).filter(t => !['Legendary', 'Basic'].includes(t));
  const o = { id: slug(c.name), name: c.name, types, cost: parseCost(c.mana_cost), colors: c.colors, typeLine: c.type_line, text: c.oracle_text || '', img: c.image_uris.normal, art: c.image_uris.art_crop };
  if (c.type_line.includes('Legendary')) o.legendary = true;
  if (c.type_line.includes('Basic')) o.basic = true;
  if (types.includes('Creature')) { o.power = +c.power; o.toughness = +c.toughness; }
  o.keywords = c.keywords.map(k => k.toLowerCase()).filter(k => !['share intelligence'].includes(k));
  if (LANDS[c.name]) o.mana = [{ add: [LANDS[c.name]] }];
  Object.assign(o, SPEC[c.name] || {});
  return o;
});
const byName = Object.fromEntries(out.map(c => [c.name, c]));
const decks = DECKS.map(d => {
  const ok = c => c.colors.every(k => d.colors.includes(k)) && Object.keys(c.cost).every(k => k === 'generic' || d.colors.includes(k));
  const staples = Object.keys(SPEC).map(n => byName[n]).filter(c => c && !c.legendary && ok(c)).map(c => c.id);
  const left = { ...CURVE }; const list = [...staples];
  for (const c of fill[d.id]) { if (list.length >= NONLAND) break; if (left[c.cmc] > 0) { left[c.cmc]--; list.push(slug(c.name)); } }
  list.push('command-tower');
  for (let i = 0; list.length < 99; i++) list.push(slug(BASIC[d.colors[i % 2]]));
  return { id: d.id, name: d.name, commander: slug(d.commander), cards: list };
});
const used = new Set(decks.flatMap(d => [d.commander, ...d.cards]));
writeFileSync(new URL('../src/data/cards.json', import.meta.url), JSON.stringify(out.filter(c => used.has(c.id)), null, 1));
writeFileSync(new URL('../src/data/decks.json', import.meta.url), JSON.stringify(decks, null, 1));
console.log(used.size, 'cards;', decks.map(d => `${d.name}: ${d.cards.length + 1} cards, ${d.cards.filter(x => byName[Object.keys(SPEC).find(n => slug(n) === x)]).length} staples`).join('; '));
