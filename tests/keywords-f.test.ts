import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import {
  newGame, startGame, CARDS, registerCards, registerDeck, unregisterDeck,
  castSpell, pass, answerDecision, dealDamage, isCommander, resolveCommanders,
  faceCommanders, type DeckDef,
} from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import { pairError, pairingInfo, canBeSecondCommander, isBackground } from '../src/import/deck';
import '../src/engine/ai';

function sc(name: string, type_line: string, o: Partial<ScryCard> = {}): ScryCard {
  return { name, type_line, mana_cost: '', oracle_text: '', colors: [], color_identity: [], keywords: [], legalities: { commander: 'legal' }, ...o };
}

describe('phase F: commander pairing rules', () => {
  it('allows two Partner commanders and rejects Partner with a non-partner', () => {
    const a = sc('Thrasios, Triton Hero', 'Legendary Creature — Merfolk Wizard', { keywords: ['Partner'], oracle_text: 'Partner', color_identity: ['G','U'] });
    const b = sc('Tymna the Weaver', 'Legendary Creature — Human Cleric', { keywords: ['Partner'], oracle_text: 'Partner', color_identity: ['W','B'] });
    expect(pairError(a, b)).toBeNull();
    expect(pairingInfo(a).partner).toBe(true);
    const sol = sc('Sol Ring', 'Artifact', { oracle_text: '{T}: Add {C}{C}.' });
    expect(pairError(a, sol)).toMatch(/legal pairing|Partner/);
  });

  it('Partner with only pairs the named cards, not generic Partner', () => {
    const r = sc('Regna, the Redeemer', 'Legendary Creature — Angel', { keywords: ['Partner with Kamber, the Plunderer'], oracle_text: 'Partner with Kamber, the Plunderer' });
    const k = sc('Kamber, the Plunderer', 'Legendary Creature — Vampire', { keywords: ['Partner with Regna, the Redeemer'], oracle_text: 'Partner with Regna, the Redeemer' });
    const t = sc('Tymna the Weaver', 'Legendary Creature — Human Cleric', { keywords: ['Partner'], oracle_text: 'Partner' });
    expect(pairError(r, k)).toBeNull();
    expect(pairError(r, t)).toMatch(/Partner with/);
  });

  it('Friends forever pairs with Friends forever, not Partner', () => {
    const a = sc('Bjorna, Nightfall Alchemist', 'Legendary Creature — Human', { keywords: ['Friends forever'], oracle_text: 'Friends forever' });
    const b = sc('Wernog, Rider\'s Chaplain', 'Legendary Creature — Human', { keywords: ['Friends forever'], oracle_text: 'Friends forever' });
    const p = sc('Tymna the Weaver', 'Legendary Creature — Human Cleric', { keywords: ['Partner'], oracle_text: 'Partner' });
    expect(pairError(a, b)).toBeNull();
    expect(pairError(a, p)).toMatch(/legal pairing/);
  });

  it('Choose a Background pairs with a Background enchantment', () => {
    const cmd = sc('Erinis, Gloom Stalker', 'Legendary Creature — Halfling Ranger', { keywords: ['Choose a Background'], oracle_text: 'Choose a Background' });
    const bg = sc('Folk Hero', 'Legendary Enchantment — Background', { type_line: 'Legendary Enchantment — Background', oracle_text: 'Commander creatures you own have...' });
    expect(isBackground(bg)).toBe(true);
    expect(canBeSecondCommander(cmd, bg)).toBe(true);
    expect(pairError(cmd, bg)).toBeNull();
    const p = sc('Tymna the Weaver', 'Legendary Creature — Human Cleric', { keywords: ['Partner'], oracle_text: 'Partner' });
    expect(pairError(cmd, p)).toMatch(/legal pairing|Background/);
  });

  it("Doctor's companion pairs with a Time Lord Doctor", () => {
    const doc = sc('The Fourteenth Doctor', 'Legendary Creature — Time Lord Doctor', { type_line: 'Legendary Creature — Time Lord Doctor' });
    const comp = sc('Sarah Jane Smith', 'Legendary Creature — Human Detective', { keywords: ["Doctor's companion"], oracle_text: "Doctor's companion" });
    expect(pairError(doc, comp)).toBeNull();
    const p = sc('Tymna the Weaver', 'Legendary Creature — Human Cleric', { keywords: ['Partner'], oracle_text: 'Partner' });
    expect(pairError(doc, p)).toMatch(/legal pairing|Doctor/);
  });
});

describe('phase F: two commanders in the command zone', () => {
  function mk(name: string, colors: string[], text = 'Partner', type = 'Legendary Creature — Human'): CardDef {
    const cl = compileScry({ name, type_line: type, mana_cost: '{1}', oracle_text: text, colors: colors as never, color_identity: colors as never, keywords: text === 'Partner' ? ['Partner'] : [], power: '2', toughness: '2' });
    const d = { ...cl.def, id: 'kf-' + cl.def.id, colors: colors as CardDef['colors'] }; registerCards([d]);
    return d;
  }

  it('puts both partners in the command zone with union identity, separate tax and commander damage', () => {
    const a = mk('KF Alpha', ['W', 'U']);
    const b = mk('KF Beta', ['B']);
    const island = Object.values(CARDS).find(c => c.name === 'Island')!;
    const deck: DeckDef = { id: 'kf-pair', name: 'Pair', commander: a.id, partner: b.id, cards: Array(98).fill(island.id) };
    registerDeck(deck);
    const g = newGame({ decks: ['kf-pair', 'judith', 'ruric', 'benton'], seed: 3, humans: [], skipAiMulligan: true });
    const p = g.players[0];
    expect(p.commanderIds.sort()).toEqual([a.id, b.id].sort());
    expect(p.command.map(c => c.id).sort()).toEqual([a.id, b.id].sort());
    expect(p.identity.sort()).toEqual(['B', 'U', 'W']);
    expect(p.library.some(c => c.id === a.id || c.id === b.id)).toBe(false);

    startGame(g);
    let i = 0; while (!(g.step === 'main1' && !g.stack.length && g.active === 0) && i++ < 80) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); }
    const ca = p.command.find(c => c.id === a.id)!;
    const cb = p.command.find(c => c.id === b.id)!;
    expect(isCommander(g, ca) && isCommander(g, cb)).toBe(true);

    for (let k = 0; k < 20; k++) p.pool.push('W','U','B','R','G','C');
    expect(castSpell(g, 0, ca.uid)).toBe(true);
    // resolve back to command? it's a creature, it enters. Cast again from command after moving it back.
    // tax is recorded on first cast
    expect(p.casts[a.id]).toBe(1);
    expect(p.casts[b.id] ?? 0).toBe(0);
    // commander damage is per commander
    const src = ca;
    dealDamage(g, src.id, src, { player: 1 }, 4, true);
    dealDamage(g, cb.id, cb, { player: 1 }, 3, true);
    const dmg = g.players[1].cmdDamage;
    const vals = Object.values(dmg);
    expect(vals).toContain(4);
    expect(vals).toContain(3);
    expect(Math.max(...vals)).toBeLessThan(21);
    unregisterDeck('kf-pair');
  });

  it('keeps a Background in the command zone as the second commander', () => {
    const cmd = mk('KF Stalker', ['G'], 'Choose a Background', 'Legendary Creature — Halfling Ranger');
    const bgCl = compileScry({ name: 'KF Folk Hero', type_line: 'Legendary Enchantment — Background', mana_cost: '{1}{W}', oracle_text: 'Choose a Background\nCommander creatures you own have "whenever this creature attacks, draw a card."', colors: ['W'], color_identity: ['W'], keywords: [] });
    const bg = { ...bgCl.def, id: 'kf-' + bgCl.def.id }; registerCards([bg]);
    const island = Object.values(CARDS).find(c => c.name === 'Island')!;
    const deck: DeckDef = { id: 'kf-bg', name: 'BG', commander: cmd.id, partner: bg.id, cards: Array(98).fill(island.id) };
    registerDeck(deck);
    const g = newGame({ decks: ['kf-bg', 'judith', 'ruric', 'benton'], seed: 3, humans: [], skipAiMulligan: true });
    expect(g.players[0].command.map(c => c.id).sort()).toEqual([cmd.id, bg.id].sort());
    expect(g.players[0].identity.sort()).toEqual(['G', 'W']);
    unregisterDeck('kf-bg');
  });

  it('ncmd pick-one still shuffles unused face commanders into the library', () => {
    const faces = [mk('KF Face A', ['W']), mk('KF Face B', ['U']), mk('KF Face C', ['B'])];
    const island = Object.values(CARDS).find(c => c.name === 'Island')!;
    const d: DeckDef = { id: 'kf-ncmd', name: 'Ncmd', commander: faces[0].id, extra: [faces[1].id, faces[2].id], cards: Array(97).fill(island.id) };
    const r = resolveCommanders(d, faces[1].id);
    expect(r.commanders).toEqual([faces[1].id]);
    expect(r.library.sort()).toEqual([faces[0].id, faces[2].id].sort());
    expect(faceCommanders(d).length).toBe(3);
  });
});
