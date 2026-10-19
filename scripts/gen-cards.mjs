// Generates the original card pool + 4 precon decks as JSON. Run: npm run gen:cards
import { writeFileSync } from 'node:fs';
const C = {
  W: { adj: ['Dawn', 'Sunlit', 'Gilded', 'Valiant', 'Radiant', 'Halo'], noun: ['Knight', 'Cleric', 'Paladin', 'Sentinel', 'Lancer', 'Griffin', 'Warden', 'Templar'], kw: ['vigilance', 'lifelink', 'flying', 'first strike'] },
  U: { adj: ['Tide', 'Misty', 'Azure', 'Cloud', 'Mirror', 'Deep'], noun: ['Sage', 'Drake', 'Sphinx', 'Illusionist', 'Wisp', 'Leviathan', 'Scholar', 'Djinn'], kw: ['flying', 'flying', 'vigilance'] },
  B: { adj: ['Grave', 'Dusk', 'Hollow', 'Bone', 'Shade', 'Rot'], noun: ['Ghoul', 'Wraith', 'Cultist', 'Vampire', 'Horror', 'Reaper', 'Lich', 'Bat'], kw: ['deathtouch', 'lifelink', 'deathtouch'] },
  R: { adj: ['Ember', 'Cinder', 'Blaze', 'Storm', 'Ash', 'Molten'], noun: ['Goblin', 'Berserker', 'Dragon', 'Raider', 'Elemental', 'Hellion', 'Shaman', 'Imp'], kw: ['haste', 'first strike', 'trample', 'haste'] },
  G: { adj: ['Moss', 'Wild', 'Thorn', 'Elder', 'Grove', 'Feral'], noun: ['Elf', 'Wurm', 'Bear', 'Hydra', 'Treefolk', 'Druid', 'Beast', 'Spider'], kw: ['trample', 'vigilance', 'trample'] },
};
const CMCS = [1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 6, 6, 2, 3, 4, 7];
const SPELLS = {
  W: [['Sudden Renewal', 'Instant', 2, 'gainLife', 5], ['Banishing Light Rite', 'Sorcery', 3, 'destroyCreature', 0], ['Banner of the Host', 'Enchantment', 3, 'anthem', 1], ['Font of Mercy', 'Enchantment', 2, 'upkeepLife', 1], ['Shining Verdict', 'Instant', 2, 'damageAny', 2], ['Inspired Charge', 'Instant', 1, 'pump', 2], ['Hymn of Plenty', 'Sorcery', 4, 'gainLife', 8], ['Holy Rebuke', 'Instant', 4, 'destroyCreature', 0]],
  U: [['Quick Study', 'Instant', 2, 'draw', 2], ['Tome of Tides', 'Sorcery', 4, 'draw', 3], ['Arcane Insight', 'Instant', 3, 'draw', 2], ['Brainstorm Surge', 'Sorcery', 2, 'draw', 2], ['Static Bolt', 'Instant', 3, 'damageAny', 3], ['Library Vision', 'Enchantment', 3, 'upkeepLife', 1], ['Wave of Clarity', 'Sorcery', 6, 'draw', 4], ['Mind Spike', 'Instant', 1, 'damageAny', 1]],
  B: [['Final Breath', 'Instant', 3, 'destroyCreature', 0], ['Siphon Souls', 'Sorcery', 4, 'drainOpponents', 2], ['Dark Bargain', 'Sorcery', 3, 'draw', 2], ['Night Feast', 'Sorcery', 6, 'drainOpponents', 4], ['Grim Pact', 'Instant', 2, 'draw', 1], ['Shadow Throne', 'Enchantment', 4, 'anthem', 1], ['Necrotic Touch', 'Instant', 2, 'destroyCreature', 0], ['Blood Tithe', 'Sorcery', 2, 'drainOpponents', 1]],
  R: [['Flame Lash', 'Instant', 1, 'damageAny', 2], ['Searing Blast', 'Instant', 3, 'damageAny', 4], ['Fire Rain', 'Sorcery', 4, 'damageOpponents', 3], ['Rage Surge', 'Instant', 1, 'pump', 3], ['War Drums', 'Enchantment', 3, 'anthem', 1], ['Volcanic Spray', 'Sorcery', 2, 'damageOpponents', 1], ['Meteor Call', 'Sorcery', 6, 'damageAny', 7], ['Spark Bolt', 'Instant', 2, 'damageAny', 3]],
  G: [['Rampant Growth Rite', 'Sorcery', 2, 'rampLand', 1], ['Wild Might', 'Instant', 1, 'pump', 3], ['Seek the Wilds', 'Sorcery', 3, 'rampLand', 1], ['Verdant Hymn', 'Enchantment', 4, 'anthem', 1], ['Forest Bounty', 'Sorcery', 3, 'draw', 2], ['Titanic Surge', 'Instant', 2, 'pump', 4], ['Natural Order Rite', 'Sorcery', 5, 'rampLand', 2], ['Roots of Life', 'Enchantment', 2, 'upkeepLife', 1]],
};
const TEXT = { draw: n => `Draw ${n} card${n > 1 ? 's' : ''}.`, gainLife: n => `You gain ${n} life.`, damageAny: n => `Deal ${n} damage to any target.`, destroyCreature: () => 'Destroy target creature.', drainOpponents: n => `Each opponent loses ${n} life. You gain ${n} life.`, damageOpponents: n => `Deal ${n} damage to each opponent.`, pump: n => `Target creature gets +${n}/+${n} until end of turn.`, rampLand: n => `Put ${n} basic land${n > 1 ? 's' : ''} from your library onto the battlefield tapped.`, anthem: n => `Creatures you control get +${n}/+${n}.`, upkeepLife: n => `At the beginning of your upkeep, gain ${n} life.` };
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const cost = (col, cmc, pipsMax = 3) => { const pips = Math.min(cmc, cmc <= 2 ? 1 : cmc <= 5 ? 2 : 3, pipsMax); return { generic: cmc - pips, [col]: pips }; };
const cards = []; const byColor = {};
for (const [col, d] of Object.entries(C)) {
  byColor[col] = []; const seen = new Set();
  CMCS.forEach((cmc, i) => {
    let name = `${d.adj[i % d.adj.length]} ${d.noun[(i * 3 + 1) % d.noun.length]}`; while (seen.has(name)) name += ' Elite'; seen.add(name);
    const kws = i % 3 === 0 ? [] : [d.kw[i % d.kw.length]];
    const base = cmc + (cmc >= 5 ? 1 : 0); let p = base, t = base;
    if (kws.length) { if (i % 2) p = Math.max(1, p - 1); else t = Math.max(1, t - 1); }
    if (col === 'G') t += 1; if (col === 'R') p += 1, t = Math.max(1, t - 1); if (col === 'U') p = Math.max(1, p - 1);
    const c = { id: slug(name), name, types: ['Creature'], cost: cost(col, cmc), colors: [col], power: p, toughness: t, keywords: kws, text: kws.join(', ') };
    cards.push(c); byColor[col].push(c.id);
  });
  for (const [name, type, cmc, kind, amt] of SPELLS[col]) {
    const c = { id: slug(name), name, types: [type], cost: cost(col, cmc, 2), colors: [col], effect: { kind, amount: amt }, text: TEXT[kind](amt) };
    cards.push(c); byColor[col].push(c.id);
  }
}
const art = [
  { id: 'prism-signet', name: 'Prism Signet', types: ['Artifact'], cost: { generic: 2 }, colors: [], produces: ['ANY'], text: 'T: Add one mana of any color in your commander\'s color identity.' },
  { id: 'worn-mana-stone', name: 'Worn Mana Stone', types: ['Artifact'], cost: { generic: 2 }, colors: [], produces: ['C'], text: 'T: Add C.' },
  { id: 'clay-golem', name: 'Clay Golem', types: ['Artifact', 'Creature'], cost: { generic: 3 }, colors: [], power: 3, toughness: 3, keywords: [], text: '' },
  { id: 'iron-colossus', name: 'Iron Colossus', types: ['Artifact', 'Creature'], cost: { generic: 6 }, colors: [], power: 6, toughness: 6, keywords: ['trample'], text: 'trample' },
];
const lands = [
  ...[['plains', 'Plains', 'W'], ['island', 'Island', 'U'], ['swamp', 'Swamp', 'B'], ['mountain', 'Mountain', 'R'], ['forest', 'Forest', 'G']].map(([id, name, c]) => ({ id, name, types: ['Land'], basic: true, cost: { generic: 0 }, colors: [], produces: [c], text: `T: Add ${c}.` })),
  { id: 'command-tower', name: 'Command Tower', types: ['Land'], cost: { generic: 0 }, colors: [], produces: ['ANY'], text: 'T: Add one mana of any color in your commander\'s color identity.' },
];
const commanders = [
  { id: 'calis-seraph-admiral', name: 'Calis, Seraph Admiral', cols: ['W', 'U'], cost: { generic: 3, W: 1, U: 1 }, power: 4, toughness: 4, keywords: ['flying', 'vigilance'] },
  { id: 'vessk-ember-tyrant', name: 'Vessk, Ember Tyrant', cols: ['B', 'R'], cost: { generic: 2, B: 1, R: 1 }, power: 4, toughness: 3, keywords: ['haste', 'deathtouch'] },
  { id: 'grukk-wildfire-chief', name: 'Grukk, Wildfire Chief', cols: ['R', 'G'], cost: { generic: 3, R: 1, G: 1 }, power: 6, toughness: 5, keywords: ['trample', 'haste'] },
  { id: 'thalla-grove-marshal', name: 'Thalla, Grove Marshal', cols: ['G', 'W'], cost: { generic: 2, G: 1, W: 1 }, power: 4, toughness: 5, keywords: ['vigilance', 'lifelink'] },
].map(c => ({ id: c.id, name: c.name, types: ['Creature'], legendary: true, cost: c.cost, colors: c.cols, power: c.power, toughness: c.toughness, keywords: c.keywords, text: c.keywords.join(', ') }));
const all = [...cards, ...art, ...lands, ...commanders];
const byId = Object.fromEntries(all.map(c => [c.id, c]));
const cmcOf = id => Object.values(byId[id].cost).reduce((a, b) => a + b, 0);
const basicOf = { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest' };
const names = { 'calis-seraph-admiral': 'Azure Armada (WU)', 'vessk-ember-tyrant': 'Ashen Pact (BR)', 'grukk-wildfire-chief': 'Wildfire Stampede (RG)', 'thalla-grove-marshal': 'Grove Guard (GW)' };
const decks = commanders.map(cmd => {
  const pool = [...byColor[cmd.colors[0]], ...byColor[cmd.colors[1]]].sort((a, b) => cmcOf(b) - cmcOf(a)).slice(8);
  const cards = [...pool, ...art.map(a => a.id), 'command-tower'];
  for (let i = 0; cards.length < 99; i++) cards.push(basicOf[cmd.colors[i % 2]]);
  return { id: cmd.id.split('-')[0], name: names[cmd.id], commander: cmd.id, cards };
});
writeFileSync(new URL('../src/data/cards.json', import.meta.url), JSON.stringify(all, null, 1));
writeFileSync(new URL('../src/data/decks.json', import.meta.url), JSON.stringify(decks, null, 1));
console.log(all.length, 'cards;', decks.map(d => d.name + ' ' + (d.cards.length + 1)).join(', '));
