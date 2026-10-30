import { describe, it, expect } from 'vitest';
import { parseDecklist, parseLine } from '../src/import/parse';
import { lookupCards, ScryCard, FetchLike } from '../src/import/scryfall';
import { classify, parseManaLine } from '../src/import/classify';
import { resolve, checkLegality, buildDeck, commanderOptions, defaultCommanders, exportText, toDeckDef } from '../src/import/deck';
import { newGame, registerCards, registerDeck, CARDS, playLand, castSpell, findPayment } from '../src/engine/engine';
import '../src/engine/ai';

// ---------- mock Scryfall ----------
const iu = (n: string) => ({ normal: `https://img/${n}.jpg`, art_crop: `https://art/${n}.jpg` });
const legal = { commander: 'legal' };
function sc(name: string, type_line: string, o: Partial<ScryCard> = {}): ScryCard {
  return { name, type_line, mana_cost: '', oracle_text: '', colors: [], color_identity: [], keywords: [], legalities: legal, image_uris: iu(name), ...o };
}
const DB: ScryCard[] = [
  sc('Atraxa, Praetors\' Voice', 'Legendary Creature — Phyrexian Angel Horror', { mana_cost: '{G}{W}{U}{B}', power: '4', toughness: '4', color_identity: ['W', 'U', 'B', 'G'], keywords: ['Flying', 'Vigilance', 'Deathtouch', 'Lifelink', 'Proliferate'], oracle_text: 'Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate.' }),
  sc('Sol Ring', 'Artifact', { mana_cost: '{1}', oracle_text: '{T}: Add {C}{C}.' }),
  sc('Serra Angel', 'Creature — Angel', { mana_cost: '{3}{W}{W}', power: '4', toughness: '4', colors: ['W'], color_identity: ['W'], keywords: ['Flying', 'Vigilance'], oracle_text: 'Flying, vigilance' }),
  sc('Watery Grave', 'Land — Island Swamp', { oracle_text: '({T}: Add {U} or {B}.)\nAs Watery Grave enters, you may pay 2 life. If you don\'t, it enters tapped.', color_identity: ['U', 'B'], produced_mana: ['U', 'B'] }),
  sc('Dimir Guildgate', 'Land — Gate', { oracle_text: 'This land enters tapped.\n{T}: Add {U} or {B}.', color_identity: ['U', 'B'], produced_mana: ['U', 'B'] }),
  sc('Fellwar Stone', 'Artifact', { mana_cost: '{2}', oracle_text: '{T}: Add one mana of any color that a land an opponent controls could produce.' }),
  sc('Llanowar Elves', 'Creature — Elf Druid', { mana_cost: '{G}', power: '1', toughness: '1', colors: ['G'], color_identity: ['G'], oracle_text: '{T}: Add {G}.' }),
  sc('Opt', 'Instant', { mana_cost: '{U}', colors: ['U'], color_identity: ['U'], oracle_text: 'Scry 1.\nDraw a card.' }),
  sc('Tarmogoyf', 'Creature — Lhurgoyf', { mana_cost: '{1}{G}', power: '*', toughness: '1+*', colors: ['G'], color_identity: ['G'], oracle_text: "Tarmogoyf's power is equal to..." }),
  sc('Delver of Secrets // Insectile Aberration', 'Creature — Human Wizard // Creature — Human Insect', { layout: 'transform', image_uris: undefined, color_identity: ['U'], card_faces: [{ name: 'Delver of Secrets', mana_cost: '{U}', type_line: 'Creature — Human Wizard', oracle_text: 'At the beginning...', power: '1', toughness: '1', image_uris: iu('delver') }, { name: 'Insectile Aberration', type_line: 'Creature — Human Insect', oracle_text: 'Flying', power: '3', toughness: '2' }] }),
  sc('Relentless Rats', 'Creature — Rat', { mana_cost: '{1}{B}{B}', power: '2', toughness: '2', color_identity: ['B'], oracle_text: 'Relentless Rats gets +1/+1 for each other creature you control named Relentless Rats.\nA deck can have any number of cards named Relentless Rats.' }),
  sc('Lightning Bolt', 'Instant', { mana_cost: '{R}', colors: ['R'], color_identity: ['R'], oracle_text: 'Lightning Bolt deals 3 damage to any target.' }),
  sc('Mana Crypt', 'Artifact', { mana_cost: '{0}', oracle_text: '{T}: Add {C}{C}.', legalities: { commander: 'banned' } }),
  sc('Island', 'Basic Land — Island', { oracle_text: '({T}: Add {U}.)', color_identity: ['U'], produced_mana: ['U'] }),
  sc('Swamp', 'Basic Land — Swamp', { oracle_text: '({T}: Add {B}.)', color_identity: ['B'], produced_mana: ['B'] }),
  sc('Plains', 'Basic Land — Plains', { oracle_text: '({T}: Add {W}.)', color_identity: ['W'], produced_mana: ['W'] }),
  sc('Forest', 'Basic Land — Forest', { oracle_text: '({T}: Add {G}.)', color_identity: ['G'], produced_mana: ['G'] }),
  sc('Thrasios, Triton Hero', 'Legendary Creature — Merfolk Wizard', { mana_cost: '{G}{U}', power: '1', toughness: '3', color_identity: ['G', 'U'], keywords: ['Partner'], oracle_text: '{4}: Scry 1...\nPartner' }),
  sc('Tymna the Weaver', 'Legendary Creature — Human Cleric', { mana_cost: '{1}{W}{B}', power: '2', toughness: '2', color_identity: ['W', 'B'], keywords: ['Lifelink', 'Partner'], oracle_text: 'Lifelink\nAt the beginning...\nPartner' }),
];
const byName = (n: string) => DB.find(c => c.name.toLowerCase() === n.toLowerCase() || c.name.split(' // ')[0].toLowerCase() === n.toLowerCase());
function mockFetch(log: string[] = []): FetchLike {
  return async (url, init) => {
    log.push(url);
    if (url.endsWith('/cards/collection')) {
      const ids: { name: string }[] = JSON.parse(String(init!.body)).identifiers;
      const data = ids.map(i => byName(i.name)).filter(Boolean); const not_found = ids.filter(i => !byName(i.name));
      return { ok: true, status: 200, json: async () => ({ data, not_found }) };
    }
    const q = decodeURIComponent(url.split('fuzzy=')[1]).toLowerCase();
    const c = DB.find(c => c.name.toLowerCase().includes(q.replace(/s$/, '')) || (q === 'atraxa praetors voice' && c.name.startsWith('Atraxa')));
    return c ? { ok: true, status: 200, json: async () => c } : { ok: false, status: 404, json: async () => ({}) };
  };
}

describe('decklist parser', () => {
  it('reads count formats, set codes, collector numbers and markers', () => {
    expect(parseLine('1 Sol Ring')).toMatchObject({ qty: 1, name: 'Sol Ring', cmdr: false });
    expect(parseLine('1x Sol Ring')).toMatchObject({ qty: 1, name: 'Sol Ring' });
    expect(parseLine('3x  Island')).toMatchObject({ qty: 3, name: 'Island' });
    expect(parseLine('1 Sol Ring (CMR) 472')).toMatchObject({ name: 'Sol Ring', set: 'cmr', num: '472' });
    expect(parseLine('1 Sol Ring (PLST) C21-263 *F*')).toMatchObject({ name: 'Sol Ring', set: 'plst' });
    expect(parseLine('1 Atraxa, Praetors\' Voice *CMDR*')).toMatchObject({ name: 'Atraxa, Praetors\' Voice', cmdr: true });
    expect(parseLine('1x Atraxa, Praetors\' Voice (2x2) 190 [Commander{top}]')).toMatchObject({ name: 'Atraxa, Praetors\' Voice', cmdr: true });
    expect(parseLine('1x Sol Ring (c21) 263 [Ramp] ^Have,#37d67a^')).toMatchObject({ name: 'Sol Ring', cmdr: false, category: 'Ramp' });
    expect(parseLine('Sol Ring')).toMatchObject({ qty: 1, name: 'Sol Ring' });
    expect(parseLine('1 Delver of Secrets / Insectile Aberration')).toMatchObject({ name: 'Delver of Secrets // Insectile Aberration' });
  });
  it('Arena / Moxfield "Commander" + "Deck" section headers', () => {
    const p = parseDecklist('Commander\n1 Atraxa, Praetors\' Voice (2X2) 190\n\nDeck\n1 Sol Ring (CMR) 472\n10 Island (UNF) 236\n\nSideboard\n1 Doom Blade');
    expect(p.entries).toEqual([{ name: 'Atraxa, Praetors\' Voice', qty: 1, section: 'commander', set: '2x2', num: '190' }, { name: 'Sol Ring', qty: 1, section: 'main', set: 'cmr', num: '472' }, { name: 'Island', qty: 10, section: 'main', set: 'unf', num: '236' }]);
  });
  it('MTGO .txt: commander in the sideboard; Moxfield plain: trailing block', () => {
    expect(parseDecklist('1 Sol Ring\n10 Island\n\nSIDEBOARD:\n1 Atraxa, Praetors\' Voice').entries.find(e => e.section === 'commander')?.name).toBe('Atraxa, Praetors\' Voice');
    expect(parseDecklist('1 Sol Ring\n10 Island\n\n1 Atraxa, Praetors\' Voice').entries.find(e => e.section === 'commander')?.name).toBe('Atraxa, Praetors\' Voice');
    expect(parseDecklist('// Commander\n1 Atraxa, Praetors\' Voice\n// Mainboard\n1 Sol Ring\n// Maybeboard\n1 Doom Blade').entries.map(e => e.name)).toEqual(['Atraxa, Praetors\' Voice', 'Sol Ring']);
  });
  it('MTGO .dek XML', () => {
    const xml = `<?xml version="1.0"?><Deck><NetDeckID>0</NetDeckID><Cards CatID="1" Quantity="1" Sideboard="false" Name="Sol Ring" /><Cards CatID="2" Quantity="12" Sideboard="false" Name="Island" /><Cards CatID="3" Quantity="1" Sideboard="true" Name="Atraxa, Praetors&apos; Voice" /></Deck>`;
    expect(parseDecklist(xml).entries).toEqual([{ name: 'Sol Ring', qty: 1, section: 'main' }, { name: 'Island', qty: 12, section: 'main' }, { name: 'Atraxa, Praetors\' Voice', qty: 1, section: 'commander' }]);
  });
  it('warns on unreadable lines and skips comments', () => {
    const p = parseDecklist('# my deck\n1 Sol Ring\n42\n'); expect(p.entries.length).toBe(1); expect(p.warnings.length).toBe(1);
  });
});

describe('Scryfall lookup (mocked)', () => {
  it('batches by 75, falls back to fuzzy, reports missing', async () => {
    const log: string[] = []; const names = [...Array(80)].map((_, i) => `Nope ${i}`).concat(['Sol Ring', 'Atraxa Praetors Voice']);
    const r = await lookupCards(names, { fetch: mockFetch(log), delay: 0 });
    expect(log.filter(u => u.endsWith('/collection')).length).toBe(2);
    expect(r.found.get('Sol Ring')?.name).toBe('Sol Ring');
    expect(r.fuzzy['Atraxa Praetors Voice']).toBe("Atraxa, Praetors' Voice");
    expect(r.missing.length).toBe(80);
  });
});

describe('support classification', () => {
  const cls = (n: string) => classify(byName(n)!);
  it('built-in pool cards keep their hand-modelled definition', () => { const c = cls('Sol Ring'); expect(c.support).toBe('builtin'); expect(c.def.id).toBe('sol-ring'); expect(cls('Lightning Bolt').support).toBe('builtin'); });
  it('keyword creatures, mana dorks and simple lands are auto-supported', () => {
    expect(cls('Serra Angel').support).toMatch(/builtin|auto/);
    const elf = cls('Llanowar Elves'); expect(elf.support).toMatch(/builtin|auto/);
    const gate = cls('Dimir Guildgate'); expect(gate.support).toBe('auto'); expect(gate.def.etbTapped).toBe(true); expect(gate.def.mana).toEqual([{ add: ['U|B'] }]);
    expect(parseManaLine('{T}: Add {W}, {U}, or {B}.')).toEqual(['W|U|B']); expect(parseManaLine('{T}: Add {C}{C}.')).toEqual(['C', 'C']);
  });
  it('anything else is limited, with an honest reason', () => {
    const atraxa = cls("Atraxa, Praetors' Voice"); expect(atraxa.support).toBe('auto'); expect(atraxa.def.triggers?.[0].effects[0].op).toBe('proliferate');
    const opt = cls('Opt'); expect(opt.support).toBe('auto'); expect(opt.def.spell?.effects.map(e => e.op)).toEqual(['scry', 'draw']);
    const rats = cls('Relentless Rats'); expect(rats.support).toBe('limited'); expect(rats.reason).toMatch(/Relentless Rats gets/i);
    const goyf = cls('Tarmogoyf'); expect(goyf.support).toBe('limited'); expect(goyf.reason).toMatch(/variable power/);
    const delver = cls('Delver of Secrets // Insectile Aberration'); expect(delver.support).toBe('limited'); expect(delver.def.img).toBe('https://img/delver.jpg'); expect(delver.reason).toMatch(/front face/);
    const shock = cls('Watery Grave'); expect(shock.support).toBe('auto'); expect(shock.def.mana).toEqual([{ add: ['U|B'] }]); expect(shock.def.shock).toBe(2);
    expect(cls('Fellwar Stone').support).toBe('limited');
  });
});

async function importText(text: string) {
  const p = parseDecklist(text); const lk = await lookupCards(p.entries.map(e => e.name), { fetch: mockFetch(), delay: 0 }); return resolve(p, lk);
}
describe('legality', () => {
  it('legal 100-card list with any-number cards', async () => {
    const r = await importText("1 Atraxa, Praetors' Voice *CMDR*\n1 Sol Ring\n1 Serra Angel\n1 Dimir Guildgate\n30 Relentless Rats\n20 Island\n20 Swamp\n16 Plains\n10 Forest");
    expect(defaultCommanders(r)).toEqual(["Atraxa, Praetors' Voice"]);
    const l = checkLegality(r, defaultCommanders(r)); expect(l.total).toBe(100); expect(l.errors).toEqual([]);
  });
  it('flags size, duplicates, color identity, bans and non-legendary commanders', async () => {
    const r = await importText('1 Serra Angel *CMDR*\n2 Sol Ring\n1 Lightning Bolt\n1 Mana Crypt\n5 Plains');
    const l = checkLegality(r, ['Serra Angel']); const e = l.errors.join('\n');
    expect(e).toMatch(/can't be a commander/); expect(e).toMatch(/10 cards/); expect(e).toMatch(/Sol Ring appears 2 times/); expect(e).toMatch(/Lightning Bolt .*outside/); expect(e).toMatch(/Mana Crypt is banned/);
  });
  it('partners: valid pair accepted with an honest warning', async () => {
    const r = await importText('1 Thrasios, Triton Hero *CMDR*\n1 Tymna the Weaver *CMDR*\n1 Sol Ring');
    expect(commanderOptions(r)).toEqual(['Thrasios, Triton Hero', 'Tymna the Weaver']);
    const l = checkLegality(r, defaultCommanders(r)); expect(l.errors.some(x => /both need Partner/.test(x))).toBe(false); expect(l.warnings.join()).toMatch(/shuffled into your library/);
    expect(checkLegality(r, ['Thrasios, Triton Hero', 'Sol Ring']).errors.join()).toMatch(/can't be a commander|both need Partner/);
  });
});

describe('imported decks play in the engine', () => {
  it('builds, swaps limited cards for basics, exports, and runs a game', async () => {
    const r = await importText("1 Atraxa, Praetors' Voice *CMDR*\n1 Sol Ring\n1 Serra Angel\n1 Dimir Guildgate\n1 Opt\n1 Tarmogoyf\n30 Relentless Rats\n25 Island\n25 Swamp\n14 Plains");
    const keep = buildDeck(r, defaultCommanders(r), { name: 'Atraxa test', swapLimited: false, source: '', legal: true });
    expect(keep.cards.length).toBe(99); expect(keep.stats.limited).toBe(31); // Goyf, 30 Rats (Atraxa is in the command zone)
    const swap = buildDeck(r, defaultCommanders(r), { name: 'swap', swapLimited: true, source: '', legal: true });
    expect(swap.stats.swapped).toBe(31); expect(swap.cards.length).toBe(99);
    registerCards(keep.defs); registerDeck(toDeckDef(keep));
    expect(CARDS['x-atraxa-praetors-voice'].limited).toBeUndefined();
    expect(exportText(keep)).toMatch(/^1 Atraxa, Praetors' Voice \*CMDR\*\n/);
    const g = newGame({ decks: [keep.id, 'judith', 'ruric', 'benton'], seed: 7 });
    expect(g.players[0].command[0].id).toBe('x-atraxa-praetors-voice'); expect(g.players[0].identity.sort()).toEqual(['B', 'G', 'U', 'W']);
    // guildgate enters tapped and taps for U or B
    const gate = { uid: g.nextUid++, id: 'x-dimir-guildgate', owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    g.players[0].hand.push(gate); g.started = true; g.active = 0; g.step = 'main1'; g.priority = 0; g.players[0].landPlayed = false;
    expect(playLand(g, 0, gate.uid)).toBe(true); expect(gate.tapped).toBe(true); gate.tapped = false;
    expect(findPayment(g.players[0], { generic: 0, B: 1 })).toBeTruthy();
    // a limited instant resolves with no effect
    const blade = { uid: g.nextUid++, id: 'x-opt', owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    g.players[0].hand.push(blade); g.players[0].battlefield.push({ uid: g.nextUid++, id: 'island', owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 });
    expect(castSpell(g, 0, blade.uid)).toBe(true);
  });
});
