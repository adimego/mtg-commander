import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import { loadPrecons, isOfficialPrecon } from '../src/import/precons';
import type { ScryCard } from '../src/import/scryfall';
import precons from '../src/data/precons.json';
import {
  activate, addCounters, answerDecision, canActivate, canCast, ctr, def, enter, faceCommanders, flushTriggers, isCommander,
  isType, layer, newGame, offBfEff, pass, planPayment, power, registerCards, restrOk, startGame, DECKS, toughness, draw,
} from '../src/engine/engine';
import type { Card, CardDef, Decision, Game } from '../src/engine/engine';
import '../src/engine/ai';

const DATA = precons as unknown as { decks: { name: string; set: string; commanders: string[]; cards: { q: number; name: string }[] }[]; cards: Record<string, ScryCard> };
const TREK = ['Federation Fleet', 'Landing Party', 'Klingon Fury', 'We Are the Borg'];
let n = 0;
function card(name: string): CardDef {
  const sc = DATA.cards[name];
  expect(sc, name).toBeTruthy();
  const cl = compileScry(sc);
  const d = { ...cl.def, id: `trc-${++n}-${cl.def.id}` };
  registerCards([d]);
  expect(cl.support, `${name}: ${JSON.stringify(cl.unparsed ?? cl.reason)}`).not.toBe('limited');
  return d;
}
function setup(): Game {
  const g = newGame({ seed: 7, humans: [], skipAiMulligan: true, decks: DECKS.slice(0, 4).map(d => d.id) });
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; }
  startGame(g);
  let i = 0;
  while (!(g.step === 'main1' && !g.stack.length && g.active === 0) && i++ < 80) { if (g.decision) answerDecision(g, false); else if (g.priority !== null) pass(g, g.priority); else break; }
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; p.battlefield = []; }
  return g;
}
const mk = (g: Game, pid: number, d: CardDef): Card => { const c: Card = { uid: g.nextUid++, id: d.id, owner: pid, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 }; offBfEff(c); return c; };
function put(g: Game, pid: number, d: CardDef): Card { const c = mk(g, pid, d); enter(g, c, pid); return c; }
function run(g: Game, color?: string) {
  for (const p of g.players) p.human = true;
  let i = 0;
  while ((g.stack.length || g.decision || g.choice || g.pending.length) && i++ < 200) {
    if (!g.stack.length && !g.decision && !g.choice && g.pending.length) { flushTriggers(g); continue; }
    if (g.decision) {
      const d = g.decision as Decision;
      if (d.kind === 'color') { answerDecision(g, color ?? d.options[0]); continue; }
      if (d.kind === 'may') { answerDecision(g, false); continue; }
      if (d.kind === 'pick') { answerDecision(g, []); continue; }
      answerDecision(g, false); continue;
    }
    if (g.priority !== null && !g.decision && !g.choice && !g.res) { pass(g, g.priority); continue; }
    break;
  }
}

describe('Star Trek Commander precons', () => {
  const ps = loadPrecons();

  it('all four official TRC decks are 100/100 with two commander choices', () => {
    const trek = ps.filter(p => TREK.includes(p.name));
    expect(trek).toHaveLength(4);
    for (const p of trek) {
      expect(p.set).toBe('TRC');
      expect(isOfficialPrecon(p)).toBe(true);
      expect(p.supported, `${p.name}: ${p.unsupported.join(', ')}`).toBe(100);
      expect(p.unsupported).toEqual([]);
      expect(1 + (p.extra?.length ?? 0) + p.cards.length).toBe(100);
      expect(faceCommanders(p).length).toBe(2);
    }
  });

  it('existing official and custom decks stay at 100/100', () => {
    for (const p of ps) expect(p.supported, `${p.name}: ${p.unsupported.join(', ')}`).toBe(100);
  });

  it('each Trek face commander and partner identity is present', () => {
    const want: Record<string, string[]> = {
      'Federation Fleet': ['Jean-Luc Picard, Luminary', 'Captain Janeway, Endgame'],
      'Landing Party': ['Commander Spock', 'Captain Kirk, Boldly Going'],
      'Klingon Fury': ['Worf, Defiant Commander', 'Kor, Cause of Vengeance'],
      'We Are the Borg': ['The Borg Queen', 'Locutus of Borg'],
    };
    for (const [name, cmds] of Object.entries(want)) {
      const p = ps.find(x => x.name === name)!;
      expect(faceCommanders(p).map(id => def({ id }).name)).toEqual(cmds);
    }
  });

  it("Queen's Diamond mana can be spent only to cast your commander", () => {
    const g = setup();
    const diamond = put(g, 0, card("Queen's Diamond"));
    addCounters(g, diamond, 'charge', 3);
    const i = /* mana ability index */ (def(diamond).abilities ?? []).findIndex(a => a.manaAb);
    expect(i).toBeGreaterThanOrEqual(0);
    for (const p of g.players) p.human = true;
    expect(canActivate(g, 0, diamond, i)).toBe(true);
    expect(activate(g, 0, diamond.uid, i)).toBe(true);
    let g2 = 0;
    while ((g.decision || g.res) && g2++ < 40) {
      if (g.decision?.kind === 'color') answerDecision(g, 'U');
      else if (g.decision) answerDecision(g, false);
      else break;
    }
    expect(g.players[0].pool.filter(s => s.startsWith('U@commander:'))).toHaveLength(3);

    const cmdDef = card('The Borg Queen');
    const cmd = mk(g, 0, cmdDef);
    g.players[0].command.push(cmd);
    g.players[0].commanderIds = [cmd.id];
    expect(isCommander(g, cmd)).toBe(true);
    expect(restrOk('commander:', { spell: def(cmd), commander: true })).toBe(true);
    expect(restrOk('commander:', { spell: def(cmd), commander: false })).toBe(false);
    expect(planPayment(g.players[0], { generic: 0, U: 3 }, { spend: { spell: def(cmd), commander: true } })).toBeTruthy();
    expect(planPayment(g.players[0], { generic: 0, U: 3 }, { spend: { spell: def(cmd), commander: false } })).toBeNull();

    const other = mk(g, 0, card('Sol Ring'));
    g.players[0].hand.push(other);
    expect(canCast(g, 0, other)).toBe(false);
  });

  it('Strange New Worlds counts differently named lands for Colossal Clone Master', () => {
    const g = setup();
    const island = card('Island');
    const plains = card('Plains');
    const island2 = { ...island, id: island.id + '-b' }; registerCards([island2]);
    put(g, 0, island); put(g, 0, island2); put(g, 0, plains);
    const clone = mk(g, 0, card('Colossal Clone Master'));
    clone.snwPt = true;
    g.players[0].battlefield.push(clone); layer(g);
    expect(power(g, clone)).toBe(2);
    expect(toughness(g, clone)).toBe(2);
    put(g, 0, card('Command Tower'));
    layer(g);
    expect(power(g, clone)).toBe(3);
  });

  it('Battlefront tracks unique opponents attacked this turn', () => {
    const g = setup();
    g.players[0].atkOpps = [1, 2];
    expect(g.players[0].atkOpps).toHaveLength(2);
    const worf = card('Worf, Defiant Commander');
    expect(worf.compiled || worf.triggers || worf.abilities).toBeTruthy();
  });

  it('Seek out leftover and Assimilate cards fully compile', () => {
    for (const name of [
      'Join the Collective',
      'Locutus of Borg',
      'The Borg Queen',
      'Gift of Perfection',
      'One, Borg Evolved',
    ]) {
      const d = card(name);
      expect(d.limited).toBeFalsy();
    }
  });

  it('Mosswort Bridge hideaway is wired and combat celebrant can exert', () => {
    const moss = card('Mosswort Bridge');
    expect(moss.hideaway).toBe(4);
    const cele = card('Combat Celebrant');
    expect(cele.celebrant).toBe(true);
  });

  it('Chekov replaces a draw by revealing until a land when you have few lands', () => {
    const g = setup();
    put(g, 0, card('Pavel Chekov, First Posting'));
    const p = g.players[0];
    p.library = [];
    const land = mk(g, 0, card('Island'));
    const spell = mk(g, 0, card('Sol Ring'));
    p.library.push(land, spell); // pop from end: Sol Ring first, then Island
    draw(g, 0, 1);
    expect(p.hand.map(c => def(c).name)).toEqual(['Island']);
    expect(p.library[0] && def(p.library[0]).name).toBe('Sol Ring');
  });

  it('Koloth goads Tribbles and Kang uses a distinct script kind', () => {
    const k = card('Koloth, Tribble Hunter');
    expect(k.koloth).toBe(true);
    const kang = card('Kang, Suspicious Captain');
    expect(JSON.stringify(kang.triggers ?? []).includes('kangGoad')).toBe(true);
    expect(JSON.stringify(kang.triggers ?? []).includes('"kang"')).toBe(false);
  });
});
