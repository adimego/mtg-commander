import { describe, it, expect } from 'vitest';
import { newGame, startGame, Game, Card, costOf, castSpell, destroy, findPayment, declareAttackers, declareBlockers, advance, DECKS, validateDeck, mulligan, power, CARDS } from '../src/engine/engine';
import { tick } from '../src/engine/controller';
const find = (f: (c: (typeof CARDS)[string]) => boolean) => Object.values(CARDS).find(f)!.id;
const VANILLA3 = find(c => !!c.types.includes('Creature') && !c.keywords?.length && c.power === 3 && c.toughness === 3 && !c.legendary);
const TRAMPLER = find(c => !!c.keywords?.includes('trample') && c.power! >= 5);
const VIGIL = find(c => !!c.keywords?.includes('vigilance') && !c.keywords?.includes('flying'));
const FLYER = find(c => !!c.keywords?.includes('flying') && c.power! >= 1);
const LIFELINK = find(c => !!c.keywords?.includes('lifelink') && !c.keywords?.includes('first strike') && c.power! >= 2);
const FIRST = find(c => !!c.keywords?.includes('first strike') && c.power! >= 2 && !c.keywords?.includes('flying'));
const CMDR0 = DECKS[0].commander;

function setup(): Game { const g = newGame({ seed: 42, humans: [0], skipAiMulligan: true }); for (const p of g.players) { p.library.push(...p.hand); p.hand = []; } startGame(g); return g; }
function put(g: Game, pid: number, id: string, zone: 'battlefield' | 'hand' = 'battlefield'): Card { const c: Card = { uid: g.nextUid++, id, owner: pid, tapped: false, sick: false, damage: 0, pump: 0 }; g.players[pid][zone].push(c); return c; }
function toStep(g: Game, s: string) { while (g.step !== s) advance(g); }

describe('decks', () => {
  it('all precons are 100-card singleton within color identity', () => { for (const d of DECKS) expect(validateDeck(d)).toEqual([]); });
  it('detects color identity violations', () => { const d = { ...DECKS[0], cards: [...DECKS[0].cards.slice(1), 'lightning-bolt'] }; expect(validateDeck(d).join()).toMatch(/identity/); });
  it('starts at 40 life with commander in command zone', () => { const g = newGame({ seed: 1 }); expect(g.players.every(p => p.life === 40 && p.command.length === 1)).toBe(true); });
  it('first mulligan is free', () => { const g = newGame({ seed: 3, skipAiMulligan: true }); mulligan(g, 0); expect(g.players[0].hand.length).toBe(7); mulligan(g, 0); expect(g.players[0].hand.length).toBe(6); });
});

describe('mana', () => {
  it('pays colored and generic costs from lands', () => {
    const g = setup(); const p = g.players[0]; put(g, 0, 'plains'); put(g, 0, 'island');
    expect(findPayment(p, { generic: 1, W: 1 })).toHaveLength(2);
    expect(findPayment(p, { generic: 0, W: 2 })).toBeNull();
    expect(findPayment(p, { generic: 2, W: 1 })).toBeNull();
  });
  it('Command Tower makes only commander-identity colors', () => {
    const g = setup(); const p = g.players[0]; put(g, 0, 'command-tower');
    expect(findPayment(p, { generic: 0, U: 1 })).not.toBeNull(); expect(findPayment(p, { generic: 0, R: 1 })).toBeNull(); // deck 0 is WU
  });
  it('casting taps the lands used', () => { const g = setup(); toStep(g, 'main1'); const l1 = put(g, 0, 'plains'), l2 = put(g, 0, 'plains'); const c = put(g, 0, 'sacred-nectar', 'hand'); expect(castSpell(g, 0, c.uid)).toBe(true); expect(l1.tapped && l2.tapped).toBe(true); expect(g.players[0].life).toBe(44); expect(castSpell(g, 0, put(g, 0, 'sacred-nectar', 'hand').uid)).toBe(false); });
  it('Lightning Bolt hits a player; Blood Tithe drains all opponents', () => { const g = setup(); toStep(g, 'main1'); for (let i = 0; i < 5; i++) put(g, 0, i < 2 ? 'mountain' : 'swamp'); const b = put(g, 0, 'lightning-bolt', 'hand'); castSpell(g, 0, b.uid, { player: 2 }); expect(g.players[2].life).toBe(37); castSpell(g, 0, put(g, 0, 'blood-tithe', 'hand').uid); expect(g.players[1].life).toBe(37); expect(g.players[0].life).toBe(49); });
});

describe('commander tax', () => {
  it('adds {2} per previous cast from the command zone', () => {
    const g = setup(); toStep(g, 'main1'); const p = g.players[0]; const cmd = p.command[0];
    const base = CARDS[cmd.id].cost.generic; expect(costOf(g, cmd).generic).toBe(base);
    for (let i = 0; i < 11; i++) put(g, 0, i % 2 ? 'plains' : 'island');
    expect(castSpell(g, 0, cmd.uid)).toBe(true); expect(p.battlefield).toContain(cmd);
    destroy(g, cmd); expect(p.command).toContain(cmd);
    expect(costOf(g, cmd).generic).toBe(base + 2);
    for (const c of p.battlefield) c.tapped = false;
    expect(castSpell(g, 0, cmd.uid)).toBe(true); destroy(g, cmd);
    expect(costOf(g, cmd).generic).toBe(base + 4);
  });
});

describe('combat', () => {
  function atk(g: Game, id: string, defender = 1) { toStep(g, 'attackers'); const a = put(g, 0, id); declareAttackers(g, 0, [{ uid: a.uid, defender }]); return a; }
  it('unblocked damage hits the chosen opponent', () => { const g = setup(); const a = atk(g, VANILLA3, 2); advance(g); advance(g); expect(g.players[2].life).toBe(37); expect(a.tapped).toBe(true); });
  it('summoning sick creatures cannot attack', () => { const g = setup(); toStep(g, 'attackers'); const a = put(g, 0, VANILLA3); a.sick = true; declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }]); expect(a.attacking).toBeUndefined(); });
  it('blocking, trample and deathtouch', () => {
    const g = setup(); const a = atk(g, TRAMPLER); advance(g);
    const b = put(g, 1, VANILLA3); declareBlockers(g, 1, [{ blocker: b.uid, attacker: a.uid }]); advance(g);
    expect(g.players[1].life).toBe(40 - (CARDS[TRAMPLER].power! - 3)); expect(g.players[1].graveyard.map(c => c.id)).toContain(VANILLA3);
  });
  it('flying can only be blocked by flying; vigilance stays untapped', () => {
    const g = setup(); expect(atk(g, VIGIL).tapped).toBe(false); });
  it('flying attackers cannot be blocked by ground creatures', () => { const g = setup(); const a = atk(g, FLYER); advance(g);
    const b = put(g, 1, VANILLA3); declareBlockers(g, 1, [{ blocker: b.uid, attacker: a.uid }]); expect(b.blocking).toBeUndefined();
  });
  it('first strike kills before regular damage', () => {
    const g = setup(); toStep(g, 'attackers'); const a = put(g, 0, FIRST); declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }]); advance(g);
    const b = put(g, 1, VANILLA3); b.damage = 3 - Math.min(3, power(g, a)); // first striker's damage is lethal
    declareBlockers(g, 1, [{ blocker: b.uid, attacker: a.uid }]); advance(g);
    expect(g.players[0].battlefield).toContain(a); expect(g.players[1].battlefield).not.toContain(b);
  });
  it('lifelink gains life', () => { const g = setup(); atk(g, LIFELINK); advance(g); advance(g); expect(g.players[0].life).toBe(40 + CARDS[LIFELINK].power!); });
});

describe('commander damage & win', () => {
  it('21 combat damage from one commander eliminates a player', () => {
    const g = setup(); const pw = CARDS[CMDR0].power!; g.players[1].cmdDamage[0] = 21 - pw; g.players[1].life = 100;
    toStep(g, 'attackers'); const a = put(g, 0, CMDR0); declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }]); advance(g); advance(g);
    expect(g.players[1].cmdDamage[0]).toBe(21); expect(g.players[1].lost).toBe(true);
  });
  it('non-commander damage does not count as commander damage', () => { const g = setup(); toStep(g, 'attackers'); const a = put(g, 0, VANILLA3); declareAttackers(g, 0, [{ uid: a.uid, defender: 1 }]); advance(g); advance(g); expect(g.players[1].cmdDamage[0]).toBeUndefined(); });
  it('last player standing wins; full AI game finishes', () => {
    const g = newGame({ seed: 7, humans: [] }); startGame(g);
    for (let i = 0; i < 20000 && g.winner === null; i++) tick(g);
    expect(g.winner).not.toBeNull();
  });
});

describe('human-in-the-loop flow', () => {
  it('game progresses with a human who passes and never blocks', async () => {
    const { waitingForHuman } = await import('../src/engine/controller');
    const g = newGame({ seed: 11 }); startGame(g);
    for (let i = 0; i < 40000 && g.winner === null; i++) {
      if (waitingForHuman(g)) { if (g.step === 'blockers') declareBlockers(g, 0, []); else { if (g.step === 'attackers') declareAttackers(g, 0, []); advance(g); } }
      else tick(g);
    }
    expect(g.winner).not.toBeNull();
  });
});
