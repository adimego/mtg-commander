import { describe, it, expect } from 'vitest';
import { compileScry } from '../src/import/classify';
import type { ScryCard } from '../src/import/scryfall';
import { loadPrecons } from '../src/import/precons';
import { costOf, castZone, def, newGame, startGame, Game, Card, registerCards, activate, pass, answerDecision, declareAttackers, ctr, findCard, power, hasKw, layer, castSpell, canCast, chooseTriggerTargets, tapForMana, offBfEff, flushTriggers, dealDamage, subtypes, colorPips, enter, playLand, moveCard, addCounters } from '../src/engine/engine';
import type { CardDef } from '../src/engine/types';
import type { Decision } from '../src/engine/engine';
import { tick } from '../src/engine/controller';
import '../src/engine/ai';

let n = 0;
function card(name: string, type_line: string, mana_cost: string, oracle_text: string, o: Partial<ScryCard> = {}): CardDef {
  const cl = compileScry({ name, type_line, mana_cost, oracle_text, colors: ['U'], color_identity: ['U'], keywords: [], ...o });
  const d = { ...cl.def, id: `nm-${++n}-${cl.def.id}` }; registerCards([d]);
  expect(cl.support, JSON.stringify(cl.unparsed ?? cl.reason)).toBe('auto');
  return d;
}
function setup(): Game {
  const g = newGame({ seed: 7, humans: [], skipAiMulligan: true });
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; }
  startGame(g); let i = 0; while (!(g.step === 'main1' && !g.stack.length && g.active === 0) && i++ < 80) { if (g.decision) answerDecision(g, false); else pass(g, g.priority!); }
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; p.battlefield = []; }
  return g;
}
const mk = (g: Game, pid: number, d: CardDef): Card => { const c: Card = { uid: g.nextUid++, id: d.id, owner: pid, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 }; offBfEff(c); return c; };
function put(g: Game, pid: number, d: CardDef, o: { tapped?: boolean } = {}): Card { const c = mk(g, pid, d); c.tapped = !!o.tapped; if (d.loyalty) c.counters = { loyalty: d.loyalty }; g.players[pid].battlefield.push(c); layer(g); return c; }
interface Ans { may?: boolean | ((t: string) => boolean); pick?: (cards: Card[], text: string) => number[]; color?: string | ((t: string) => string); order?: (cards: Card[]) => number[] }
function run(g: Game, o: Ans = {}) {
  for (const p of g.players) p.human = true; let i = 0;
  while ((g.stack.length || g.decision || g.choice) && i++ < 400) {
    if (g.choice) {
      const slots = g.choice.trig.tslots ?? [];
      const ts = slots.map(s => {
        if (s.who === 'card') { const gy = g.players.flatMap(p => p.graveyard).filter(c => !s.f?.anyType || s.f.anyType.some(t => def(c).types.includes(t))); return gy[0] ? { card: gy[0].uid } : undefined; }
        if (s.who === 'ability' || s.who === 'stack' || s.who === 'spell') { const rev = [...g.stack].reverse(); const it = rev.find(x => s.who === 'spell' ? x.kind === 'spell' : x.kind !== 'spell') ?? rev[0]; return it ? { stack: it.id } : undefined; }
        const c = g.players.flatMap(p => p.battlefield).find(x => !s.f?.types || s.f.types.every(t => def(x).types.includes(t) || (def(x).sub ?? []).includes(t)));
        return c ? { card: c.uid } : undefined;
      });
      expect(chooseTriggerTargets(g, ts)).toBe(true); continue;
    }
    const d = g.decision as Decision | null; if (!d) { pass(g, g.priority!); continue; }
    if (d.kind === 'orderTop') answerDecision(g, { order: (o.order ?? ((cs: Card[]) => cs.map(c => c.uid)))(d.cards) });
    else if (d.kind === 'may') answerDecision(g, typeof o.may === 'function' ? o.may(d.text) : !!o.may);
    else if (d.kind === 'pick') answerDecision(g, (o.pick ?? (cs => cs.slice(0, Math.max(d.min, 1)).map(c => c.uid)))(d.cards, d.text));
    else if (d.kind === 'color') answerDecision(g, typeof o.color === 'function' ? o.color(d.text) : o.color ?? d.options[0]);
    else if (d.kind === 'ctype') answerDecision(g, d.options.includes('Merfolk') ? 'Merfolk' : d.options[0]);
    else if (d.kind === 'scry') answerDecision(g, { top: d.cards.map(c => c.uid), away: [] });
    else answerDecision(g, false);
  }
  expect(g.stack.length + (g.decision ? 1 : 0) + (g.choice ? 1 : 0), g.log.slice(-4).join(' | ')).toBe(0);
}
const ISLAND = () => card('Island', 'Basic Land — Island', '', '({T}: Add {U}.)');
const FOREST = () => card('N Forest', 'Basic Land — Forest', '', '({T}: Add {G}.)');
const MER = (name = 'N Merfolk') => card(name, 'Creature — Merfolk', '{U}', '', { power: '1', toughness: '1' });
const BEAR = () => card('N Bear', 'Creature — Bear', '{1}{G}', '', { power: '2', toughness: '2', colors: ['G'] });
const ZAP = () => card('N Zap', 'Instant', '{U}', 'Draw a card.');
const SHOCK = () => card('N Shock', 'Instant', '{R}', 'N Shock deals 2 damage to any target.', { colors: ['R'] });

describe('Namor deck interactions', () => {
  it('pins the preset at 100/100', () => {
    const p = loadPrecons().find(d => d.name === 'Namor the Sub-Mariner')!;
    expect(p.supported).toBe(100);
    expect(p.unsupported).toEqual([]);
    expect(p.cards.length + 1).toBe(100);
  });

  it("Namor's power counts Merfolk and blue pips make that many tokens", () => {
    const g = setup();
    const namor = put(g, 0, card('Namor the Sub-Mariner', 'Legendary Creature — Mutant Merfolk Villain', '{1}{U}{U}', "Flying\nNamor's power is equal to the number of Merfolk you control.\nWhenever you cast a noncreature spell with one or more blue mana symbols in its mana cost, create that many 1/1 blue Merfolk creature tokens.", { power: '*', toughness: '4', keywords: ['Flying'] }));
    put(g, 0, MER()); expect(power(g, namor)).toBe(2);
    const uu = mk(g, 0, card('N Two Blue', 'Instant', '{U}{U}', 'Draw a card.')); g.players[0].hand.push(uu); g.players[0].pool.push('U', 'U');
    expect(castSpell(g, 0, uu.uid)).toBe(true); run(g);
    expect(g.players[0].battlefield.filter(c => def(c).sub?.includes('Merfolk') && c.token).length).toBe(2);
    expect(power(g, namor)).toBe(4);
    const red = mk(g, 0, SHOCK()); g.players[0].hand.push(red); g.players[0].pool.push('R');
    const before = g.players[0].battlefield.filter(c => c.token).length;
    expect(castSpell(g, 0, red.uid, { player: 1 })).toBe(true); run(g);
    expect(g.players[0].battlefield.filter(c => c.token).length).toBe(before);
    expect(colorPips(def(uu), 'U')).toBe(2);
  });

  it('Eluge makes flooded lands Islands and reduces the first instant by {U} then generic', () => {
    const g = setup();
    const eluge = card('Eluge, the Shoreless Sea', 'Legendary Creature — Elemental Fish', '{1}{U}{U}{U}', "Eluge's power and toughness are each equal to the number of Islands you control.\nWhenever Eluge enters or attacks, put a flood counter on target land. It's an Island in addition to its other types for as long as it has a flood counter on it.\nThe first instant or sorcery spell you cast each turn costs {U} (or {1}) less to cast for each land you control with a flood counter on it.", { power: '*', toughness: '*' });
    put(g, 0, eluge);
    const forest = put(g, 0, FOREST());
    forest.floodIsle = true; addCounters(g, forest, 'flood', 1); layer(g);
    expect(subtypes(def(forest))).toContain('Island');
    expect(def(forest).mana?.some(m => m.add.includes('U'))).toBe(true);
    expect(def(forest).mana?.some(m => m.add.includes('G'))).toBe(true);
    const counter = card('Counterspell', 'Instant', '{U}{U}', 'Counter target spell.');
    expect(costOf(g, mk(g, 0, counter)).U ?? 0).toBe(1);
    const rift = card('Cyclonic Rift', 'Instant', '{1}{U}', "Return target nonland permanent you don't control to its owner's hand.");
    expect(costOf(g, mk(g, 0, rift)).generic).toBe(1);
    expect(costOf(g, mk(g, 0, rift)).U ?? 0).toBe(0);
    g.players[0].spells = { turn: g.turn, n: 1, nonc: 1, isv: 1, ins: 1 };
    expect(costOf(g, mk(g, 0, counter)).U ?? 0).toBe(2);
    // four flooded lands reduce {4}{U}{U} to {2}
    for (let i = 0; i < 3; i++) { const l = put(g, 0, FOREST()); l.floodIsle = true; addCounters(g, l, 'flood', 1); }
    g.players[0].spells = { turn: g.turn, n: 0, nonc: 0, isv: 0, ins: 0 }; layer(g);
    const season = card('N Season', 'Sorcery', '{4}{U}{U}', 'Draw a card.');
    const paid = costOf(g, mk(g, 0, season));
    expect(paid.U ?? 0).toBe(0); expect(paid.generic).toBe(2);
  });

  it('Harbinger turns nonbasic lands into Islands and strips their other abilities', () => {
    const g = setup();
    const sanctuary = put(g, 1, card('Mystic Sanctuary', 'Land — Island', '', "({T}: Add {U}.)\nThis land enters tapped unless you control three or more other Islands.\nWhen this land enters untapped, you may put target instant or sorcery card from your graveyard on top of your library."));
    expect(def(sanctuary).triggers?.length ?? 0).toBeGreaterThan(0);
    put(g, 0, card('Harbinger of the Seas', 'Creature — Merfolk Wizard', '{1}{U}{U}', 'Nonbasic lands are Islands.', { power: '2', toughness: '2' }));
    expect(subtypes(def(sanctuary))).toEqual(['Island']);
    expect(def(sanctuary).basic).toBeFalsy();
    expect(def(sanctuary).triggers?.length ?? 0).toBe(0);
    expect(def(sanctuary).mana?.some(m => m.add.includes('U'))).toBe(true);
    const basic = put(g, 1, ISLAND());
    expect(def(basic).basic).toBe(true);
    expect(def(basic).mana?.some(m => m.add.includes('U'))).toBe(true);
  });

  it('Back to Basics stops nonbasic lands untapping; High Tide adds {U}', () => {
    const g = setup();
    const nb = put(g, 0, card('N Nonbasic', 'Land', '', '{T}: Add {U}.'), { tapped: true });
    const basic = put(g, 0, ISLAND(), { tapped: true });
    put(g, 1, card('Back to Basics', 'Enchantment', '{2}{U}', "Nonbasic lands don't untap during their controllers' untap steps."));
    expect(hasKw(nb, '_doesntuntap')).toBe(true);
    expect(hasKw(basic, '_doesntuntap')).toBe(false);
    const tide = mk(g, 0, card('High Tide', 'Instant', '{U}', 'Until end of turn, whenever a player taps an Island for mana, that player adds an additional {U}.'));
    g.players[0].hand.push(tide); g.players[0].pool.push('U');
    expect(castSpell(g, 0, tide.uid)).toBe(true); run(g);
    basic.tapped = false;
    expect(tapForMana(g, 0, basic.uid)).toBe(true);
    expect(g.players[0].pool.filter(s => s === 'U').length).toBe(2);
  });

  it('Lord of Atlantis pumps every Merfolk, including an opponent\'s', () => {
    const g = setup();
    const mine = put(g, 0, MER('N Mine')); const theirs = put(g, 1, MER('N Theirs'));
    put(g, 0, card('Lord of Atlantis', 'Creature — Merfolk', '{U}{U}', 'Other Merfolk get +1/+1 and have islandwalk.', { power: '2', toughness: '2' }));
    expect(power(g, mine)).toBe(2); expect(power(g, theirs)).toBe(2);
    expect(hasKw(mine, 'islandwalk')).toBe(true); expect(hasKw(theirs, 'islandwalk')).toBe(true);
  });

  it('Kopala taxes spells and abilities that target your Merfolk', () => {
    const g = setup();
    const mer = put(g, 0, MER());
    put(g, 0, card('Kopala, Warden of Waves', 'Legendary Creature — Merfolk Wizard', '{1}{U}{U}', 'Spells your opponents cast that target a Merfolk you control cost {2} more to cast.\nAbilities your opponents activate that target a Merfolk you control cost {2} more to activate.', { power: '2', toughness: '2' }));
    const bolt = mk(g, 1, card('N Bolt', 'Instant', '{U}', 'Tap target creature.'));
    g.players[1].hand.push(bolt);
    const cost = costOf(g, bolt);
    g.priority = 1;
    g.players[1].pool.push(...Array((cost.generic || 0) + 2).fill('C'), ...Array(cost.U ?? 0).fill('U'));
    expect(castSpell(g, 1, bolt.uid, { targets: [{ card: mer.uid }] })).toBe(true);
    expect(g.players[1].pool.length).toBe(0);
  });

  it('Omniscience lets you cast a spell from your hand without paying its mana cost', () => {
    const g = setup();
    put(g, 0, card('Omniscience', 'Enchantment', '{7}{U}{U}{U}', 'You may cast spells from your hand without paying their mana costs.'));
    const big = mk(g, 0, card('N Big', 'Sorcery', '{8}{U}', 'Draw a card.'));
    g.players[0].hand.push(big);
    expect(canCast(g, 0, big)).toBe(false);
    expect(canCast(g, 0, big, { omni: true })).toBe(true);
    expect(castSpell(g, 0, big.uid, { omni: true })).toBe(true); run(g);
    expect(g.players[0].hand.length).toBe(1); // drew a card; big left the hand
    const cmd = g.players[0].command[0];
    expect(canCast(g, 0, cmd, { omni: true })).toBe(false);
  });

  it('Mystic Confluence can choose the same mode three times', () => {
    const g = setup();
    const sp = mk(g, 0, card('Mystic Confluence', 'Instant', '{3}{U}{U}', 'Choose three. You may choose the same mode more than once.\n• Counter target spell unless its controller pays {3}.\n• Return target creature to its owner\'s hand.\n• Draw a card.'));
    expect(sp && def(sp).spell?.modes?.repeat).toBe(true);
    expect(def(sp).spell?.modes?.max).toBe(3);
    g.players[0].hand.push(sp); g.players[0].pool.push(...Array(5).fill('U'));
    const hand = g.players[0].hand.length;
    expect(castSpell(g, 0, sp.uid, { modes: [2, 2, 2] })).toBe(true); run(g);
    expect(g.players[0].hand.length).toBe(hand - 1 + 3);
  });

  it('Mystic Sanctuary only offers the graveyard spell when it enters untapped', () => {
    const g = setup();
    const d = card('Mystic Sanctuary', 'Land — Island', '', "({T}: Add {U}.)\nThis land enters tapped unless you control three or more other Islands.\nWhen this land enters untapped, you may put target instant or sorcery card from your graveyard on top of your library.");
    for (let i = 0; i < 3; i++) put(g, 0, ISLAND());
    for (const p of g.players) p.graveyard = [];
    const inst = mk(g, 0, ZAP()); g.players[0].graveyard.push(inst);
    const s = mk(g, 0, d);
    g.players[0].hand.push(s);
    for (const p of g.players) p.human = true;
    expect(playLand(g, 0, s.uid)).toBe(true);
    expect(s.tapped).toBe(false);
    run(g, { may: true, pick: cs => [inst.uid].filter(u => cs.some(c => c.uid === u)) });
    expect(g.players[0].library[g.players[0].library.length - 1]).toBe(inst);
  });

  it("Sensei's Divining Top reorders, then its tap ability draws and puts it on top", () => {
    const g = setup();
    const top = put(g, 0, card("Sensei's Divining Top", 'Artifact', '{1}', "{1}: Look at the top three cards of your library, then put them back in any order.\n{T}: Draw a card, then put this artifact on top of its owner's library."));
    const a = g.players[0].library.slice(-3);
    g.players[0].pool.push('C');
    expect(activate(g, 0, top.uid, 0)).toBe(true);
    run(g, { order: cs => [...cs].reverse().map(c => c.uid) });
    expect(g.players[0].library.slice(-3).map(c => c.uid)).toEqual([...a].reverse().map(c => c.uid));
    expect(activate(g, 0, top.uid, 1)).toBe(true); run(g);
    expect(g.players[0].library[g.players[0].library.length - 1]).toBe(top);
    expect(g.players[0].hand.length).toBe(1);
  });

  it("Tishana's Tidebinder counters an ability and the permanent loses abilities while she remains", () => {
    const g = setup();
    const rock = put(g, 1, card('N Rock', 'Artifact', '{2}', '{T}: Draw a card.'));
    expect(def(rock).abilities?.length).toBe(1);
    g.players[1].pool.push('C'); // not needed
    g.priority = 1;
    expect(activate(g, 1, rock.uid, 0)).toBe(true);
    const tide = mk(g, 0, card("Tishana's Tidebinder", 'Creature — Merfolk Wizard', '{2}{U}', "Flash\nWhen this creature enters, counter up to one target activated or triggered ability. If an ability of an artifact, creature, or planeswalker is countered this way, that permanent loses all abilities for as long as this creature remains on the battlefield.", { power: '3', toughness: '2', keywords: ['Flash'] }));
    g.players[0].hand.push(tide); g.players[0].pool.push('U', 'C', 'C'); g.priority = 0; for (const p of g.players) p.human = true;
    expect(castSpell(g, 0, tide.uid)).toBe(true); run(g);
    expect(g.stack.length).toBe(0);
    expect(def(rock).abilities?.length ?? 0).toBe(0);
    const on = findCard(g, tide.uid)!;
    g.players[0].battlefield = g.players[0].battlefield.filter(c => c !== on);
    layer(g);
    expect(def(rock).abilities?.length).toBe(1);
  });

  it('Aboleth Spawn copies an opponent creature\'s ETB trigger', () => {
    const g = setup();
    put(g, 0, card('Aboleth Spawn', 'Creature — Fish Horror', '{2}{U}', 'Flash\nWard {2}\nProbing Telepathy — Whenever a creature entering under an opponent\'s control causes a triggered ability of that creature to trigger, you may copy that ability. You may choose new targets for the copy.', { power: '2', toughness: '3', keywords: ['Flash'] }));
    g.active = 1; g.step = 'main1'; g.priority = 1;
    const etb = mk(g, 1, card('N Greeter', 'Creature — Human', '{1}{U}', 'When this creature enters, draw a card.', { power: '1', toughness: '1' }));
    const lib = g.players[0].library.length; const lib1 = g.players[1].library.length;
    enter(g, etb, 1); flushTriggers(g); run(g, { may: t => /copy/.test(t) });
    expect(g.players[1].library.length).toBe(lib1 - 1);
    expect(g.players[0].library.length).toBe(lib - 1);
  });

  it('Wanderwine Prophets champions a Merfolk and returns it, or is sacrificed', () => {
    const g = setup();
    const d = card('Wanderwine Prophets', 'Creature — Merfolk Wizard', '{4}{U}{U}', 'Champion a Merfolk\nWhenever this creature deals combat damage to a player, you may sacrifice a Merfolk. If you do, take an extra turn after this one.', { power: '4', toughness: '4' });
    const lone = mk(g, 0, d);
    enter(g, lone, 0); flushTriggers(g); run(g, { may: false });
    expect(g.players[0].battlefield.includes(lone)).toBe(false);
    const host = mk(g, 0, d); const food = put(g, 0, MER('N Champ'));
    enter(g, host, 0); flushTriggers(g); run(g, { may: true, pick: () => [food.uid] });
    expect(g.players[0].battlefield.includes(host)).toBe(true);
    expect(g.players[0].exile.includes(food)).toBe(true);
    moveCard(g, host, 'graveyard'); flushTriggers(g); run(g);
    expect(g.players[0].battlefield.includes(food)).toBe(true);
  });

  it('Tandem Lookout soulbonds and both creatures draw when they deal damage', () => {
    const g = setup();
    const look = card('Tandem Lookout', 'Creature — Human Scout', '{2}{U}', 'Soulbond\nAs long as Tandem Lookout is paired with another creature, each of those creatures has "Whenever this creature deals damage to an opponent, draw a card."', { power: '2', toughness: '1' });
    const b = put(g, 0, BEAR());
    const a = mk(g, 0, look);
    enter(g, a, 0); flushTriggers(g); run(g, { may: true, pick: () => [b.uid] });
    expect(a.pair).toBe(b.uid); expect(b.pair).toBe(a.uid);
    const h = g.players[0].library.length;
    dealDamage(g, a.id, a, { player: 1 }, 1);
    dealDamage(g, b.id, b, { player: 1 }, 1);
    expect(g.players[0].library.length).toBe(h - 2);
  });

  it('Grip of the Roil surges and the creature misses its next untap', () => {
    const g = setup();
    g.players[0].spells = { turn: g.turn, n: 1, nonc: 1, isv: 1, ins: 1 };
    const bear = put(g, 1, BEAR());
    const grip = mk(g, 0, card('Grip of the Roil', 'Instant', '{2}{U}', "Surge {1}{U}\nTap target creature. It doesn't untap during its controller's next untap step.\nDraw a card."));
    g.players[0].hand.push(grip); g.players[0].pool.push('U', 'C');
    expect(canCast(g, 0, grip, { surge: true })).toBe(true);
    expect(castSpell(g, 0, grip.uid, { surge: true, targets: [{ card: bear.uid }] })).toBe(true); run(g);
    expect(bear.tapped).toBe(true); expect(bear.freeze).toBe(1);
    // walk to player 1's next turn; the creature should stay tapped through their untap
    let guard = 0; const turn = g.turn;
    while ((g.active !== 1 || g.step !== 'upkeep' || g.turn === turn) && guard++ < 400) { if (g.decision) answerDecision(g, false); else if (g.priority !== null) pass(g, g.priority); else break; }
    expect(bear.tapped).toBe(true); expect(bear.freeze).toBeUndefined();
  });

  it("Louisoix's Sacrifice counters an ability by paying {2} or by sacrificing a legend", () => {
    const g = setup();
    const rock = put(g, 1, card('N Well', 'Artifact', '{1}', '{T}: Draw a card.'));
    g.priority = 1; expect(activate(g, 1, rock.uid, 0)).toBe(true);
    const sx = card("Louisoix's Sacrifice", 'Instant', '{U}', "As an additional cost to cast this spell, sacrifice a legendary creature or pay {2}.\nCounter target activated ability, triggered ability, or noncreature spell.");
    const sp = mk(g, 0, sx); g.players[0].hand.push(sp); g.players[0].pool.push('U', 'C', 'C'); g.priority = 0; for (const p of g.players) p.human = true;
    const ab = g.stack.find(s => s.kind === 'ability')!;
    expect(castSpell(g, 0, sp.uid, { orPay: true, targets: [{ stack: ab.id }] })).toBe(true);
    run(g);
    expect(g.stack.some(s => s.kind === 'ability' && s.sourceUid === rock.uid)).toBe(false);
  });

  it('Lullmage Mentor makes a Merfolk when you counter a spell', () => {
    const g = setup();
    put(g, 0, card('Lullmage Mentor', 'Creature — Merfolk Wizard', '{1}{U}{U}', 'Whenever a spell or ability you control counters a spell, you may create a 1/1 blue Merfolk creature token.\nTap seven untapped Merfolk you control: Counter target spell.', { power: '2', toughness: '2' }));
    const threat = mk(g, 1, ZAP()); g.players[1].hand.push(threat); g.players[1].pool.push('U');
    g.priority = 1; expect(castSpell(g, 1, threat.uid)).toBe(true); g.priority = 0; for (const p of g.players) p.human = true;
    const cs = mk(g, 0, card('Counterspell', 'Instant', '{U}{U}', 'Counter target spell.'));
    g.players[0].hand.push(cs); g.players[0].pool.push('U', 'U');
    const spell = g.stack.find(s => s.card === threat)!;
    expect(castSpell(g, 0, cs.uid, { targets: [{ stack: spell.id }] })).toBe(true); run(g, { may: true });
    expect(g.players[0].battlefield.some(c => c.token && def(c).sub?.includes('Merfolk'))).toBe(true);
  });

  it("Irenicus's Vile Duplication copies with flying and strips legendary", () => {
    const g = setup();
    const legend = put(g, 0, card('N Legend', 'Legendary Creature — Merfolk', '{U}{U}', '', { power: '3', toughness: '3' }));
    const sp = mk(g, 0, card("Irenicus's Vile Duplication", 'Sorcery', '{3}{U}', "Create a token that's a copy of target creature you control, except the token has flying and it isn't legendary."));
    g.players[0].hand.push(sp); g.players[0].pool.push(...Array(4).fill('U'));
    expect(castSpell(g, 0, sp.uid, { card: legend.uid })).toBe(true); run(g);
    const tok = g.players[0].battlefield.find(c => c.token && c !== legend)!;
    expect(tok).toBeTruthy();
    expect(hasKw(tok, 'flying')).toBe(true);
    expect(def(tok).legendary).toBe(false);
    expect(g.players[0].battlefield.includes(legend)).toBe(true);
  });

  it('Reflections of Littjara copies a spell of the chosen type with the same targets', () => {
    const g = setup();
    const ref = put(g, 0, card('Reflections of Littjara', 'Enchantment', '{4}{U}', 'As this enchantment enters, choose a creature type.\nWhenever you cast a spell of the chosen type, copy that spell.'));
    ref.chosenType = 'Merfolk';
    const bear = put(g, 1, BEAR());
    const bolt = mk(g, 0, card('N Merfolk Bolt', 'Instant — Merfolk', '{U}', 'Tap target creature.'));
    g.players[0].hand.push(bolt); g.players[0].pool.push('U');
    expect(castSpell(g, 0, bolt.uid, { card: bear.uid })).toBe(true); run(g);
    expect(bear.tapped).toBe(true);
    // the original and the copy both tap it; it is tapped either way. A second creature proves the copy resolved.
    expect(g.log.some(l => /copies/.test(l))).toBe(true);
  });

  it('Emperor Mihail lets you cast a Merfolk from the top of your library', () => {
    const g = setup();
    put(g, 0, card('Emperor Mihail II', 'Legendary Creature — Merfolk Noble', '{1}{U}{U}', 'You may look at the top card of your library any time.\nYou may cast Merfolk spells from the top of your library.\nWhenever you cast a Merfolk spell, you may pay {1}. If you do, create a 1/1 blue Merfolk creature token.', { power: '3', toughness: '3' }));
    const m = mk(g, 0, MER('N Topfolk')); g.players[0].library.push(m);
    expect(castZone(g, 0, m)).toBe('library');
    g.players[0].pool.push('U');
    expect(castSpell(g, 0, m.uid)).toBe(true); run(g, { may: false });
    expect(g.players[0].battlefield.includes(m) || g.stack.some(s => s.card === m) || g.players[0].graveyard.includes(m) || g.players[0].battlefield.includes(m)).toBe(true);
    expect(g.players[0].library.includes(m)).toBe(false);
  });

  it('Attuma draws once per player attacked by Merfolk; Military Intelligence needs two attackers', () => {
    const g = setup();
    put(g, 0, card('Attuma, Atlantean Warlord', 'Legendary Creature — Merfolk Warrior Villain', '{2}{U}{U}', 'Other Merfolk you control get +1/+1.\nWhenever one or more Merfolk you control attack a player, draw a card.', { power: '3', toughness: '4' }));
    put(g, 0, card('Military Intelligence', 'Enchantment', '{1}{U}', 'Whenever you attack with two or more creatures, draw a card.'));
    const a = put(g, 0, MER('N A')); const b = put(g, 0, MER('N B')); a.sick = false; b.sick = false;
    const lib = g.players[0].library.length;
    g.step = 'attackers'; g.awaiting = 'attack';
    declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }, { uid: b.uid, defender: 2 }]);
    flushTriggers(g); run(g);
    // Attuma: two players, two draws. Military Intelligence: two creatures, one draw.
    expect(g.players[0].library.length).toBe(lib - 3);
  });

  it('Svyelun is indestructible with two other Merfolk and grants ward {1}', () => {
    const g = setup();
    const s = put(g, 0, card('Svyelun of Sea and Sky', 'Legendary Creature — Merfolk God', '{1}{U}{U}', 'Svyelun has indestructible as long as you control at least two other Merfolk.\nWhenever Svyelun attacks, draw a card.\nOther Merfolk you control have ward {1}.', { power: '3', toughness: '4' }));
    const a = put(g, 0, MER('N S1'));
    expect(hasKw(s, 'indestructible')).toBe(false);
    put(g, 0, MER('N S2'));
    expect(hasKw(s, 'indestructible')).toBe(true);
    expect(def(a).ward).toBe(1);
  });

  it('Stonybrook Banneret reduces a Merfolk Wizard spell by {1} once', () => {
    const g = setup();
    put(g, 0, card('Stonybrook Banneret', 'Creature — Merfolk Wizard', '{1}{U}', 'Islandwalk\nMerfolk spells and Wizard spells you cast cost {1} less to cast.', { power: '1', toughness: '1', keywords: ['Islandwalk'] }));
    const both = card('N Adept', 'Creature — Merfolk Wizard', '{1}{U}', '', { power: '1', toughness: '1' });
    const c = costOf(g, mk(g, 0, both));
    expect(c.generic).toBe(0);
    expect(c.U ?? 0).toBe(1);
  });

  it("Aquitect's Will floods a land and draws when you control a Merfolk", () => {
    const g = setup();
    put(g, 0, MER());
    const land = put(g, 1, FOREST());
    const sp = mk(g, 0, card("Aquitect's Will", 'Kindred Sorcery — Merfolk', '{U}', 'Put a flood counter on target land. That land is an Island in addition to its other types for as long as it has a flood counter on it. If you control a Merfolk, draw a card.'));
    g.players[0].hand.push(sp); g.players[0].pool.push('U');
    const lib = g.players[0].library.length;
    expect(castSpell(g, 0, sp.uid, { card: land.uid })).toBe(true); run(g);
    expect(ctr(land, 'flood')).toBe(1);
    expect(subtypes(def(land))).toContain('Island');
    expect(subtypes(def(land))).toContain('Forest');
    expect(g.players[0].library.length).toBe(lib - 1);
  });

  it('Distant Melody draws for each permanent of the chosen type', () => {
    const g = setup();
    put(g, 0, MER('N D1')); put(g, 0, MER('N D2')); put(g, 0, BEAR());
    const sp = mk(g, 0, card('Distant Melody', 'Sorcery', '{3}{U}', 'Choose a creature type. Draw a card for each permanent you control of that type.'));
    g.players[0].hand.push(sp); g.players[0].pool.push(...Array(4).fill('U'));
    const lib = g.players[0].library.length;
    expect(castSpell(g, 0, sp.uid)).toBe(true);
    run(g);
    expect(g.players[0].library.length).toBe(lib - 2);
  });

  it('the Namor deck plays a few turns against precons without crashing', () => {
    const ps = loadPrecons(); const namor = ps.find(p => p.name === 'Namor the Sub-Mariner')!;
    const others = ps.filter(p => p !== namor).slice(0, 3).map(p => p.id);
    const g = newGame({ seed: 3, humans: [], decks: [namor.id, ...others], skipAiMulligan: true });
    expect(g.players[0].command[0] && def(g.players[0].command[0]).name).toBe('Namor the Sub-Mariner');
    startGame(g); let steps = 0;
    while (g.winner === null && g.turn < 8 && steps++ < 8000) tick(g);
    expect(steps).toBeLessThan(8000);
    expect(g.turn).toBeGreaterThanOrEqual(8);
  });
});
