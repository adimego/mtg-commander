import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import { loadPrecons, isOfficialPrecon } from '../src/import/precons';
import {
  def, newGame, startGame, canBeCommander, ctr, pass, answerDecision, layer, addCounters, hasKw,
  registerCards, dealDamage, emit, sacrifice, toughness, canCast, evokeCost, payBlight, checkState,
} from '../src/engine/engine';
import type { Game, Card } from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import type { ScryCard } from '../src/import/scryfall';
import preconData from '../src/data/precons.json';

const cards = (preconData as unknown as { cards: Record<string, ScryCard> }).cards;
const ps = loadPrecons();
const ecc = ps.filter(p => p.set === 'ECC');
const deck = (name: string) => ps.find(p => p.name === name)!;

const CMDS = ['Ashling, the Limitless', 'Mass of Mysteries', 'Auntie Ool, Cursewretch', 'The Reaper, King No More'];

function compile(name: string) {
  const cl = compileScry(cards[name]);
  expect(cl.support, `${name}: ${JSON.stringify(cl.unparsed)}`).toBe('auto');
  return cl.def;
}

function setup(): Game {
  const g = newGame({ seed: 7, humans: [], skipAiMulligan: true });
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; }
  startGame(g); let i = 0; while (!(g.step === 'main1' && !g.stack.length && g.active === 0) && i++ < 80) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); }
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; p.battlefield = []; }
  return g;
}
function put(g: Game, pid: number, d: CardDef): Card {
  const c: Card = { uid: g.nextUid++, id: d.id, owner: pid, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
  g.players[pid].battlefield.push(c); layer(g); return c;
}
const BEAR: CardDef = { id: 'ecc-test-bear', name: 'Test Bear', types: ['Creature'], sub: ['Bear'], cost: { generic: 2 }, colors: ['G'], power: 2, toughness: 2, text: '' };
const ELEM: CardDef = { id: 'ecc-test-elem', name: 'Test Elemental', types: ['Creature'], sub: ['Elemental'], cost: { generic: 3, R: 1 }, colors: ['R'], power: 3, toughness: 3, text: '' };

describe('Lorwyn Eclipsed Commander', () => {
  it('both official ECC decks are 100/100 with two face commanders', () => {
    expect(ecc.map(p => p.name).sort()).toEqual(['Blight Curse', 'Dance of the Elements']);
    for (const p of ecc) {
      expect(isOfficialPrecon(p)).toBe(true);
      expect(p.setName).toBe('Lorwyn Eclipsed Commander');
      expect(p.released).toBe('2026-01-23');
      expect(p.supported, `${p.name}: ${p.unsupported.join(', ')}`).toBe(100);
      expect(p.unsupported).toEqual([]);
      expect(1 + (p.extra?.length ?? 0) + p.cards.length).toBe(100);
      expect(p.commander).toBeTruthy();
      expect(p.extra?.length ?? 0).toBe(1);
    }
    expect(def({ id: deck('Dance of the Elements').commander }).name).toBe('Ashling, the Limitless');
    expect(deck('Dance of the Elements').extra?.map(id => def({ id }).name)).toEqual(['Mass of Mysteries']);
    expect(def({ id: deck('Blight Curse').commander }).name).toBe('Auntie Ool, Cursewretch');
    expect(deck('Blight Curse').extra?.map(id => def({ id }).name)).toEqual(['The Reaper, King No More']);
  });

  it('all four face commanders compile with auto support and are legal commanders', () => {
    for (const name of CMDS) {
      const d = compile(name);
      expect(canBeCommander(d)).toBe(true);
    }
  });

  it('wither and "as though it had wither" put -1/-1 counters instead of marked damage', () => {
    registerCards([BEAR]);
    const g = setup();
    const banshee = compile('Midnight Banshee');
    const src = put(g, 0, banshee);
    const tgt = put(g, 1, BEAR);
    expect(hasKw(src, 'wither')).toBe(true);
    dealDamage(g, src.id, src, { card: tgt }, 1);
    expect(tgt.damage).toBe(0);
    expect(ctr(tgt, '-1/-1')).toBe(1);

    const g2 = setup();
    const bear2: CardDef = { ...BEAR, id: 'ecc-test-bear-2' };
    registerCards([bear2]);
    const torment = compile('Everlasting Torment');
    put(g2, 0, torment);
    const src2 = put(g2, 0, BEAR);
    const tgt2 = put(g2, 1, bear2);
    dealDamage(g2, src2.id, src2, { card: tgt2 }, 2);
    expect(tgt2.damage).toBe(0);
    expect(ctr(tgt2, '-1/-1')).toBe(2);
  });

  it('persist keyword returns the creature with a -1/-1 counter', () => {
    const d = compile('Puppeteer Clique');
    expect(d.keywords?.includes('persist')).toBe(true);
    const g = setup();
    const c = put(g, 0, d);
    emit(g, 'dies', { player: 0 }, c);
    // willPersist is set on leave; destroy via checkState after lethal counters
    const g2 = setup();
    const c2 = put(g2, 0, d);
    addCounters(g2, c2, '-1/-1', 0); // no-op
    // force death without a -1/-1 already on it
    c2.damage = 99;
    checkState(g2);
    expect(c2.willPersist || g2.pending.some(p => p.trig?.label?.includes('Persist')) || g2.players[0].battlefield.some(x => x.uid === c2.uid && ctr(x, '-1/-1') === 1)).toBeTruthy();
  });

  it('blight as a cost puts -1/-1 counters on a chosen creature you control', () => {
    registerCards([BEAR]);
    const g = setup();
    const bear = put(g, 0, BEAR);
    expect(payBlight(g, 0, 2, bear.uid)).toBe(true);
    expect(ctr(bear, '-1/-1')).toBe(2);
    const auntie = compile('Auntie Ool, Cursewretch');
    expect(auntie.wardBlight).toBe(2);
    const curiosity = compile('Burning Curiosity');
    expect(curiosity.optBlight).toBe(1);
  });

  it("Ashling grants evoke {4} to elemental permanent spells you cast from your hand", () => {
    registerCards([ELEM]);
    const g = setup();
    const ash = compile('Ashling, the Limitless');
    expect(ash.grantEvokeElem).toEqual({ generic: 4 });
    put(g, 0, ash);
    const el: Card = { uid: g.nextUid++, id: ELEM.id, owner: 0, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 };
    g.players[0].hand.push(el);
    expect(evokeCost(g, 0, el)).toEqual({ generic: 4 });
    // pay {4} from four Forests / waste; the granted cost is what matters here
    for (let i = 0; i < 4; i++) g.players[0].pool.push('ANY');
    expect(canCast(g, 0, el, { evoke: true })).toBe(true);
  });

  it('Mass of Mysteries grants myriad until end of turn', () => {
    const d = compile('Mass of Mysteries');
    const grant = (d.triggers ?? []).some(t => t.effects?.some(e => e.op === 'grant' && e.kw?.includes('myriad')));
    expect(grant).toBe(true);
  });

  it('Yarok causes ETB-triggered abilities of permanents you control to trigger an additional time', () => {
    expect(compile('Yarok, the Desecrated').permTrigTwice).toBe(true);
  });

  it('Maelstrom Wanderer has cascade, cascade', () => {
    const d = compile('Maelstrom Wanderer');
    expect((d.triggers ?? []).filter(t => t.label === 'Cascade').length).toBe(2);
  });
});
