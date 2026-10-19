import { describe, it, expect } from 'vitest';
import { newGame, startGame, Game, Card, costOf, castSpell, destroy, findPayment, declareAttackers, declareBlockers, pass, DECKS, validateDeck, mulligan, CARDS, activate, canActivate, power, alive, playLand } from '../src/engine/engine';
import '../src/engine/ai';
import { tick, waitingForHuman } from '../src/engine/controller';

const id = (name: string) => { const c = Object.values(CARDS).find(c => c.name === name); if (!c) throw new Error('missing ' + name); return c.id; };
const find = (f: (c: (typeof CARDS)[string]) => boolean) => Object.values(CARDS).find(f)!.id;
const VANILLA3 = find(c => c.types.includes('Creature') && !c.keywords?.length && !c.triggers && !c.abilities && !c.mana && c.power === 3 && c.toughness === 3);
const BEAR = find(c => c.types.includes('Creature') && !c.keywords?.length && !c.triggers && !c.abilities && !c.mana && c.power === 2 && c.toughness === 2 && !c.static);
const TRAMPLER = find(c => !!c.keywords?.includes('trample') && c.power! >= 5 && !c.triggers && !c.legendary);
const VIGIL = find(c => !!c.keywords?.includes('vigilance') && !c.keywords?.includes('flying') && !c.legendary);
const FLYER = find(c => !!c.keywords?.includes('flying') && c.power! >= 1 && !c.triggers && !c.mana);
const LIFELINK = find(c => !!c.keywords?.includes('lifelink') && c.keywords.length === 1 && c.power! >= 2);
const FIRST = find(c => !!c.keywords?.includes('first strike') && !c.keywords.includes('double strike') && !c.keywords.includes('flying') && !c.triggers && c.power! >= 1);

/** All-AI game (for auto-targeting) with empty hands, at player 0's first main phase. */
function setup(): Game {
  const g = newGame({ seed: 42, humans: [], skipAiMulligan: true });
  for (const p of g.players) { p.library.push(...p.hand); p.hand = []; }
  startGame(g); toMain(g); for (const p of g.players) { p.library.push(...p.hand); p.hand = []; } return g;
}
function toMain(g: Game) { let i = 0; while (!(g.step === 'main1' && !g.stack.length) && i++ < 50) pass(g, g.priority!); }
function put(g: Game, pid: number, cid: string, zone: 'battlefield' | 'hand' = 'battlefield'): Card { const c: Card = { uid: g.nextUid++, id: cid, owner: pid, tapped: false, sick: false, damage: 0, pp: 0, pt: 0 }; g.players[pid][zone].push(c); return c; }
const lands = (g: Game, pid: number, name: string, n: number) => { for (let i = 0; i < n; i++) put(g, pid, id(name)); };
/** Everyone passes once in turn order (resolves the top item or ends the step). */
function passAll(g: Game) { const n = alive(g).length; for (let i = 0; i < n; i++) pass(g, g.priority!); }
function resolveAll(g: Game) { let i = 0; while (g.stack.length && i++ < 50) passAll(g); }
function toAttack(g: Game) { let i = 0; while (g.awaiting !== 'attack' && i++ < 50) pass(g, g.priority!); }
function attack(g: Game, list: { uid: number; defender: number }[]) { toAttack(g); declareAttackers(g, 0, list); resolveAll(g); passAll(g); }
function finishCombat(g: Game, blocks: Record<number, { blocker: number; attacker: number }[]> = {}) {
  for (const d of [1, 2, 3]) if (g.awaiting === 'block') declareBlockers(g, d, blocks[d] ?? []);
  let i = 0; while (g.step !== 'main2' && i++ < 30) { if (g.stack.length) resolveAll(g); else passAll(g); }
}

describe('decks & setup', () => {
  it('all precons are 100-card singleton within color identity', () => { for (const d of DECKS) expect(validateDeck(d)).toEqual([]); });
  it('detects color identity violations', () => { const d = { ...DECKS[0], cards: [...DECKS[0].cards.slice(1), id('Lightning Bolt')] }; expect(validateDeck(d).join()).toMatch(/identity/); });
  it('starts at 40 life with commander in command zone; first mulligan free', () => {
    const g = newGame({ seed: 3, skipAiMulligan: true }); expect(g.players.every(p => p.life === 40 && p.command.length === 1)).toBe(true);
    mulligan(g, 0); expect(g.players[0].hand.length).toBe(7); mulligan(g, 0); expect(g.players[0].hand.length).toBe(6);
  });
});

describe('mana & mana abilities', () => {
  it('pays colored and generic costs from lands', () => {
    const g = setup(); const p = g.players[0]; lands(g, 0, 'Plains', 1); lands(g, 0, 'Island', 1);
    expect(findPayment(p, { generic: 1, W: 1 })).toHaveLength(2); expect(findPayment(p, { generic: 0, W: 2 })).toBeNull();
  });
  it('Command Tower / Arcane Signet make only commander-identity colors', () => {
    const g = setup(); const p = g.players[0]; put(g, 0, id('Command Tower'));
    expect(findPayment(p, { generic: 0, U: 1 })).not.toBeNull(); expect(findPayment(p, { generic: 0, R: 1 })).toBeNull();
  });
  it('Sol Ring makes two mana from one source', () => { const g = setup(); const s = put(g, 0, id('Sol Ring')); expect(findPayment(g.players[0], { generic: 2 })).toEqual([s]); });
  it('mana dorks: summoning sick can\'t tap; Birds make any color; no stack used', () => {
    const g = setup(); const p = g.players[0]; const elf = put(g, 0, id('Llanowar Elves')); elf.sick = true;
    expect(findPayment(p, { generic: 0, G: 1 })).toBeNull(); elf.sick = false; expect(findPayment(p, { generic: 0, G: 1 })).toEqual([elf]);
    const birds = put(g, 0, id('Birds of Paradise')); expect(findPayment(p, { generic: 0, R: 1 })).toEqual([birds]);
    const gg = put(g, 0, id('Giant Growth'), 'hand'); const bear = put(g, 0, BEAR);
    expect(castSpell(g, 0, gg.uid, { card: bear.uid })).toBe(true); expect(elf.tapped).toBe(true); expect(g.stack.length).toBe(1);
  });
});

describe('commander tax', () => {
  it('adds {2} per previous cast from the command zone', () => {
    const g = setup(); const p = g.players[0]; const cmd = p.command[0]; const base = CARDS[cmd.id].cost.generic;
    expect(costOf(g, cmd).generic).toBe(base); lands(g, 0, 'Plains', 7); lands(g, 0, 'Island', 7);
    expect(castSpell(g, 0, cmd.uid)).toBe(true); resolveAll(g); expect(p.battlefield).toContain(cmd);
    destroy(g, cmd); expect(p.command).toContain(cmd); expect(costOf(g, cmd).generic).toBe(base + 2);
    g.pending = []; for (const c of p.battlefield) c.tapped = false;
    expect(castSpell(g, 0, cmd.uid)).toBe(true); resolveAll(g); destroy(g, cmd); expect(costOf(g, cmd).generic).toBe(base + 4);
  });
});

describe('stack & priority', () => {
  it('priority passes around all players; the stack resolves only after everyone passes', () => {
    const g = setup(); lands(g, 0, 'Mountain', 1); const b = put(g, 0, id('Lightning Bolt'), 'hand');
    castSpell(g, 0, b.uid, { player: 2 }); expect(g.priority).toBe(0);
    pass(g, 0); expect(g.priority).toBe(1); pass(g, 1); pass(g, 2); expect(g.players[2].life).toBe(40); expect(g.stack.length).toBe(1);
    pass(g, 3); expect(g.stack.length).toBe(0); expect(g.players[2].life).toBe(37); expect(g.priority).toBe(0);
  });
  it('out-of-turn players can cast instants only with priority', () => {
    const g = setup(); lands(g, 1, 'Mountain', 1); const b = put(g, 1, id('Lightning Bolt'), 'hand');
    expect(castSpell(g, 1, b.uid, { player: 0 })).toBe(false); pass(g, 0); expect(castSpell(g, 1, b.uid, { player: 0 })).toBe(true);
  });
  it('resolves last-in first-out: Giant Growth in response saves a creature from Lightning Bolt', () => {
    const g = setup(); lands(g, 0, 'Mountain', 1); lands(g, 1, 'Forest', 1); const bear = put(g, 1, BEAR);
    castSpell(g, 0, put(g, 0, id('Lightning Bolt'), 'hand').uid, { card: bear.uid }); pass(g, 0);
    expect(castSpell(g, 1, put(g, 1, id('Giant Growth'), 'hand').uid, { card: bear.uid })).toBe(true);
    expect(g.stack.map(s => s.label)).toEqual(['Lightning Bolt', 'Giant Growth']);
    resolveAll(g); expect(g.players[1].battlefield).toContain(bear); expect(bear.damage).toBe(3);
  });
  it('Counterspell counters a spell; Dovin\'s Veto can\'t be countered', () => {
    const g = setup(); lands(g, 0, 'Island', 5); lands(g, 0, 'Plains', 1); lands(g, 1, 'Island', 4);
    const div = put(g, 0, id('Divination'), 'hand'); castSpell(g, 0, div.uid); const sid = g.stack[0].id; pass(g, 0);
    castSpell(g, 1, put(g, 1, id('Negate'), 'hand').uid, { stack: sid }); const negId = g.stack[1].id; pass(g, 1); pass(g, 2); pass(g, 3);
    castSpell(g, 0, put(g, 0, id("Dovin's Veto"), 'hand').uid, { stack: negId }); const vetoId = g.stack[2].id; pass(g, 0);
    castSpell(g, 1, put(g, 1, id('Counterspell'), 'hand').uid, { stack: vetoId });
    resolveAll(g);
    expect(g.players[0].graveyard.map(c => c.id)).toContain(div.id); expect(g.players[0].hand.length).toBe(2); // Divination resolved
    expect(g.log.some(l => /can't be countered/.test(l))).toBe(true);
    const g2 = setup(); lands(g2, 0, 'Island', 3); lands(g2, 1, 'Island', 2); castSpell(g2, 0, put(g2, 0, id('Divination'), 'hand').uid); pass(g2, 0);
    castSpell(g2, 1, put(g2, 1, id('Counterspell'), 'hand').uid, { stack: g2.stack[0].id }); resolveAll(g2);
    expect(g2.players[0].hand.length).toBe(0); expect(g2.players[0].graveyard.map(c => c.id)).toContain(id('Divination'));
  });
  it('a spell fizzles if its target is gone', () => {
    const g = setup(); lands(g, 0, 'Mountain', 3); const bear = put(g, 1, BEAR);
    castSpell(g, 0, put(g, 0, id('Lightning Bolt'), 'hand').uid, { card: bear.uid }); castSpell(g, 0, put(g, 0, id('Searing Spear'), 'hand').uid, { card: bear.uid });
    resolveAll(g); expect(g.log.some(l => /Lightning Bolt fizzles/.test(l))).toBe(true);
  });
});

describe('activated abilities', () => {
  it('tap ability (Prodigal Pyromancer) uses the stack and respects summoning sickness', () => {
    const g = setup(); const py = put(g, 0, id('Prodigal Pyromancer')); py.sick = true; expect(canActivate(g, 0, py, 0)).toBe(false);
    py.sick = false; expect(activate(g, 0, py.uid, 0, { player: 1 })).toBe(true); expect(py.tapped).toBe(true); expect(g.stack.length).toBe(1);
    resolveAll(g); expect(g.players[1].life).toBe(39);
  });
  it('sacrifice cost (Seal of Fire) is paid immediately; mana + tap + sac (Mind Stone)', () => {
    const g = setup(); const seal = put(g, 0, id('Seal of Fire')); activate(g, 0, seal.uid, 0, { player: 2 });
    expect(g.players[0].graveyard).toContain(seal); resolveAll(g); expect(g.players[2].life).toBe(38);
    const ms = put(g, 0, id('Mind Stone')); expect(canActivate(g, 0, ms, 0)).toBe(false); lands(g, 0, 'Plains', 1);
    expect(activate(g, 0, ms.uid, 0)).toBe(true); resolveAll(g); expect(g.players[0].hand.length).toBe(1);
  });
});

describe('triggered abilities', () => {
  it('ETB: Elvish Visionary draws; Flametongue Kavu kills a creature', () => {
    const g = setup(); lands(g, 0, 'Forest', 2); lands(g, 0, 'Mountain', 4); const bear = put(g, 1, VANILLA3);
    castSpell(g, 0, put(g, 0, id('Elvish Visionary'), 'hand').uid); resolveAll(g); expect(g.players[0].hand.length).toBe(1);
    castSpell(g, 0, put(g, 0, id('Flametongue Kavu'), 'hand').uid); resolveAll(g);
    expect(g.players[1].graveyard).toContain(bear);
  });
  it('dies: Perilous Myr deals 2 damage', () => {
    const g = setup(); const myr = put(g, 0, id('Perilous Myr')); destroy(g, myr); pass(g, 0); passAll(g); resolveAll(g);
    expect(g.log.some(l => /Perilous Myr: 2 damage/.test(l))).toBe(true); expect(g.players.slice(1).some(p => p.life === 38)).toBe(true);
  });
  it('attacks: Isperia draws when a creature attacks her controller', () => {
    const g = setup(); put(g, 1, id('Isperia, Supreme Judge')); const a = put(g, 0, BEAR);
    toAttack(g); declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }]); resolveAll(g); expect(g.players[1].hand.length).toBe(1);
  });
  it('combat damage to a player: Sergeant John Benton — both players draw that many', () => {
    const g = setup(); const b = put(g, 0, id('Sergeant John Benton')); attack(g, [{ uid: b.uid, defender: 2 }]); finishCombat(g);
    expect(g.players[0].hand.length).toBe(2); expect(g.players[2].hand.length).toBe(2);
  });
  it('cast triggers in APNAP order: Guttersnipe (active) below Ruric Thar (non-active); prowess', () => {
    const g = setup(); put(g, 0, id('Guttersnipe')); put(g, 1, id('Ruric Thar, the Unbowed')); const sw = put(g, 0, id('Monastery Swiftspear')); lands(g, 0, 'Mountain', 1);
    castSpell(g, 0, put(g, 0, id('Lightning Bolt'), 'hand').uid, { player: 3 });
    expect(g.stack.map(s => s.label)).toEqual(['Lightning Bolt', 'Guttersnipe: 2 damage to each opponent', 'Monastery Swiftspear: prowess +1/+1', 'Ruric Thar, the Unbowed: 6 damage to that player']);
    resolveAll(g); expect(g.players[0].life).toBe(34); expect(g.players[3].life).toBe(35); expect(power(g, sw)).toBe(2);
  });
});

describe('combat', () => {
  it('unblocked damage, summoning sickness, vigilance', () => {
    const g = setup(); const a = put(g, 0, VANILLA3); const s = put(g, 0, VANILLA3); s.sick = true; const v = put(g, 0, VIGIL);
    attack(g, [{ uid: a.uid, defender: 2 }, { uid: s.uid, defender: 2 }, { uid: v.uid, defender: 3 }]);
    expect(s.attacking).toBeUndefined(); expect(v.tapped).toBe(false); finishCombat(g); expect(g.players[2].life).toBe(37);
  });
  it('trample over a blocker', () => {
    const g = setup(); const a = put(g, 0, TRAMPLER); attack(g, [{ uid: a.uid, defender: 1 }]); const b = put(g, 1, VANILLA3);
    finishCombat(g, { 1: [{ blocker: b.uid, attacker: a.uid }] }); expect(g.players[1].life).toBe(40 - (CARDS[TRAMPLER].power! - 3));
  });
  it('flying needs flying or reach to block; reach works', () => {
    const g = setup(); const a = put(g, 0, FLYER); attack(g, [{ uid: a.uid, defender: 1 }]);
    const ground = put(g, 1, VANILLA3); const spider = put(g, 1, id('Giant Spider'));
    declareBlockers(g, 1, [{ blocker: ground.uid, attacker: a.uid }, { blocker: spider.uid, attacker: a.uid }]);
    expect(ground.blocking).toBeUndefined(); expect(spider.blocking).toBe(a.uid);
  });
  it('menace can\'t be blocked by just one creature', () => {
    const g = setup(); const a = put(g, 0, id('Boggart Brute')); attack(g, [{ uid: a.uid, defender: 1 }]); const b = put(g, 1, VANILLA3);
    finishCombat(g, { 1: [{ blocker: b.uid, attacker: a.uid }] }); expect(g.players[1].life).toBe(37);
  });
  it('first strike kills before regular damage; double strike hits twice', () => {
    const g = setup(); const a = put(g, 0, FIRST); attack(g, [{ uid: a.uid, defender: 1 }]); const b = put(g, 1, BEAR); b.damage = 2 - Math.min(2, power(g, a));
    finishCombat(g, { 1: [{ blocker: b.uid, attacker: a.uid }] }); expect(g.players[0].battlefield).toContain(a); expect(g.players[1].battlefield).not.toContain(b);
    const g2 = setup(); const ace = put(g2, 0, id('Fencing Ace')); attack(g2, [{ uid: ace.uid, defender: 1 }]); finishCombat(g2); expect(g2.players[1].life).toBe(38);
  });
  it('lifelink gains life', () => { const g = setup(); const a = put(g, 0, LIFELINK); attack(g, [{ uid: a.uid, defender: 1 }]); finishCombat(g); expect(g.players[0].life).toBe(40 + CARDS[LIFELINK].power!); });
});

describe('commander damage & win', () => {
  it('21 combat damage from one commander eliminates a player', () => {
    const g = setup(); const cid = DECKS[0].commander; const pw = CARDS[cid].power!; g.players[1].cmdDamage[0] = 21 - pw; g.players[1].life = 100;
    const a = put(g, 0, cid); attack(g, [{ uid: a.uid, defender: 1 }]); finishCombat(g); expect(g.players[1].lost).toBe(true);
  });
  it('full AI game finishes with a winner', () => {
    const g = newGame({ seed: 7, humans: [] }); startGame(g);
    for (let i = 0; i < 60000 && g.winner === null; i++) tick(g);
    expect(g.winner).not.toBeNull();
  });
  it('game progresses with a passive human (auto-pass) who never blocks or attacks', () => {
    const g = newGame({ seed: 11 }); startGame(g);
    for (let i = 0; i < 80000 && g.winner === null; i++) {
      if (waitingForHuman(g)) {
        if (g.choice) { g.choice = null; continue; }
        if (g.awaiting === 'attack') declareAttackers(g, 0, []); else if (g.awaiting === 'block') declareBlockers(g, 0, []); else pass(g, 0);
      } else tick(g);
    }
    expect(g.winner).not.toBeNull();
  });
});
void playLand;
