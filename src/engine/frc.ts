/** Exact resolution for Reality Fracture cards the generic compiler can't express. Replay-safe: library moves happen once, then decisions re-read the same cards. */
import type { Card, CardDef, Cost, Effect, Game, Player, ResCtx, Target, TokenSpec } from './engine';
import {
  addCounters, becomeCopy, CARDS, castNowStep, changeControl, cmc, createToken, def, destroy, discardCard, draw, enter,
  exileCard, findCard, gainLife, hasPStatic, isPermanentCard, isType, isTypeOrSub, legalTargets, locate, log, loseLife,
  moveCard, opponents, pay, phaseOut, planPayment, shuffle,
} from './engine';

export interface FrcApi {
  g: Game; ctx: ResCtx; e: Effect; key: string; me: number; P: Player; srcName: string;
  once: (k: string, f: () => void) => void;
  ask: <T>(k: string, d: { pid: number; kind: string; text: string } & Record<string, unknown>) => T;
}
const HOLD = new WeakMap<Game, Map<string, unknown>>();
function held<T>(g: Game, key: string, take: () => T): T {
  let m = HOLD.get(g); if (!m) HOLD.set(g, m = new Map());
  if (!m.has(key)) m.set(key, take());
  return m.get(key) as T;
}
function revealUntil(p: Player, n: number, ok: (c: Card) => boolean): { hits: Card[]; rest: Card[] } {
  const hits: Card[] = []; const rest: Card[] = [];
  while (p.library.length && hits.length < n) { const c = p.library.pop()!; (ok(c) ? hits : rest).push(c); }
  return { hits, rest };
}
const historicPerm = (c: Card) => isPermanentCard(def(c)) && isTypeOrSub(def(c), 'Historic');
const MITE: TokenSpec = { name: 'Phyrexian Mite', p: 1, t: 1, colors: [], types: ['Artifact', 'Creature'], sub: ['Phyrexian', 'Mite'], kws: ['toxic 1', '_cantblock'] };
const SPIRIT: TokenSpec = { name: 'Spirit', p: 1, t: 1, colors: ['W'], types: ['Creature'], sub: ['Spirit'], kws: ['flying'] };
const SHARK = (x: number): TokenSpec => ({ name: 'Shark', p: Math.max(0, x), t: Math.max(0, x), colors: ['U'], types: ['Creature'], sub: ['Shark'], kws: ['flying'] });
const GOBLIN: TokenSpec = { name: 'Goblin', p: 1, t: 1, colors: ['R'], types: ['Creature'], sub: ['Goblin'] };
export const GINGER: TokenSpec = {
  name: 'Gingerbrute', p: 1, t: 1, colors: [], types: ['Artifact', 'Creature'], sub: ['Food', 'Golem'], kws: ['haste'], mv: 1,
  ext: { text: "{1}: This creature can't be blocked this turn except by creatures with haste.\n{2}, {T}, Sacrifice this token: You gain 3 life.", abilities: [
    { label: "Can't be blocked this turn except by creatures with haste", mana: { generic: 1 }, effects: [{ op: 'grant', who: 'self', kw: ['_hasteonly'] }] },
    { label: 'Gain 3 life', mana: { generic: 2 }, tap: true, sac: true, effects: [{ op: 'gain', n: 3, pl: 'you' }] },
  ] },
};
export const JACE_TOK: TokenSpec = {
  name: 'Jace', colors: ['U'], types: ['Planeswalker'], sub: ['Jace'],
  ext: { text: '−1: Surveil 1.\n−3: Draw a card.', abilities: [
    { label: '−1: Surveil 1', loyalty: -1, sorcery: true, effects: [{ op: 'surveil', n: 1 }] },
    { label: '−3: Draw a card', loyalty: -3, sorcery: true, effects: [{ op: 'draw', n: 1, pl: 'you' }] },
  ] },
};
const CARD_TYPES = ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Instant', 'Land', 'Planeswalker', 'Sorcery'];
const spellMv = (c: Card) => cmc(def(c)) + (c.x ?? 0) * (CARDS[c.face ?? c.id]?.cost.x ?? def(c).cost.x ?? 0);
const typesOf = (c: Card) => CARD_TYPES.filter(t => def(c).types.includes(t));
function delayEnd(g: Game, ctx: ResCtx, label: string, effects: Effect[]) {
  (g.delayed ??= []).push({ at: 'endStep', turnAfter: g.step === 'end' || g.step === 'cleanup' ? g.turn : g.turn - 1, controller: ctx.item.controller, sourceId: ctx.item.sourceId, sourceUid: ctx.item.sourceUid, label, effects });
}
function exileYours(g: Game, pid: number): number {
  const cs = g.players[pid].battlefield.filter(c => isType(c, 'Creature'));
  for (const c of [...cs]) exileCard(g, c);
  return cs.length;
}
function dropCreatures(g: Game, pid: number, hits: Card[], rest: Card[]) {
  const p = g.players[pid];
  for (const c of hits) enter(g, c, pid, {});
  shuffle(g, rest); p.library.unshift(...rest);
  log(g, `${p.name} puts ${hits.map(c => def(c).name).join(', ') || 'no creatures'} onto the battlefield and shuffles the rest back.`);
}

export function runFrc(kind: string | undefined, a: FrcApi): boolean {
  const { g, ctx, e, key, me, P, srcName, once, ask } = a;
  const tgt = () => (ctx.item.targets ?? []).find(x => x && (x.card !== undefined || x.player !== undefined || x.stack !== undefined));
  switch (kind) {
    case 'filterMana': {
      const opts = (e.text ?? '').split('|').map(s => s.toUpperCase());
      const pick = opts.length === 1 ? opts[0] : ask<string>(key, { pid: me, kind: 'color', options: opts, text: `${srcName}: add one — ${opts.join(', ')}.` });
      once('m', () => { for (const s of [...pick.matchAll(/\{([WUBRG])\}/g)].map(m => m[1])) P.pool.push(s); log(g, `${P.name} adds ${pick}.`); });
      return true;
    }
    case 'remTime': {
      const s = findCard(g, ctx.item.sourceUid); if (!s || !(s.counters?.time ?? 0)) return true;
      once('t', () => { const n = (s.counters!.time ?? 1) - 1; s.counters!.time = Math.max(0, n); log(g, `A time counter is removed from ${def(s).name} (${s.counters!.time} left).`); });
      return true;
    }
    case 'jaceCombat': {
      const foe = g.active; const q = g.players[foe]; if (!q || q.lost || foe === me) return true;
      const cost: Cost = { generic: 2 };
      const yes = !!planPayment(q, cost) && ask<boolean>(key, { pid: foe, kind: 'may', text: `${srcName}: pay {2}? If you don't, creatures you control can't attack Jaces controlled by ${P.name} this turn.` });
      if (yes && pay(g, q, cost)) { log(g, `${q.name} pays {2}.`); return true; }
      once('n', () => { (q.noAtkJace ??= []).push({ by: me, turn: g.turn }); log(g, `Creatures ${q.name} controls can't attack Jaces ${P.name} controls this turn.`); });
      return true;
    }
    case 'nissaLand': {
      once('d', () => { draw(g, me, 1); log(g, `${P.name} draws a card.`); });
      const s = findCard(g, ctx.item.sourceUid); if (!s || s.nissaR === g.turn) return true;
      const pack = held(g, key, () => { const r = revealUntil(P, 1, c => isType(c, 'Creature')); return [...r.rest, ...r.hits]; });
      const hit = pack.filter(c => isType(c, 'Creature')).slice(0, 1); const rest = pack.filter(c => !hit.includes(c));
      once('r', () => { s.nissaR = g.turn; for (const c of hit) enter(g, c, me, {}); shuffle(g, rest); P.library.unshift(...rest); log(g, `${P.name} reveals ${pack.map(c => def(c).name).join(', ') || 'nothing'}${hit[0] ? ` and puts ${def(hit[0]).name} onto the battlefield` : ''}.`); });
      return true;
    }
    case 'dack': {
      const opps = opponents(g, me);
      const pack = held(g, key, () => { const r = revealUntil(P, opps.length, c => isType(c, 'Creature')); log(g, `${P.name} reveals ${[...r.rest, ...r.hits].map(c => def(c).name).join(', ') || 'nothing'}.`); return [...r.hits, ...r.rest]; });
      const hits = pack.filter(c => isType(c, 'Creature')).slice(0, opps.length); const rest = pack.filter(c => !hits.includes(c));
      const assign: number[] = [];
      for (let i = 0; i < hits.length; i++) { const ls = opps.filter(o => !assign.includes(o.id)); assign.push(ls.length <= 1 ? ls[0].id : ask<number>(`${key}:o${i}`, { pid: me, kind: 'player', players: ls.map(o => o.id), text: `${srcName}: choose who gains control of ${def(hits[i]).name}. Each creature goes to a different opponent.` })); }
      once('r', () => { shuffle(g, rest); P.library.unshift(...rest); hits.forEach((c, i) => { enter(g, c, me, {}); c.goad = { by: me, turn: 1e9 }; changeControl(g, c, assign[i]); log(g, `${def(c).name} is goaded for the rest of the game.`); }); });
      return true;
    }
    case 'obNix': {
      once('x', () => { let n = 0; for (const o of opponents(g, me)) for (const c of [...o.battlefield]) if (isType(c, 'Creature') && c.tapped) { destroy(g, c); if (!findCard(g, c.uid)) n++; } if (n) { gainLife(g, me, n); log(g, `${P.name} gains ${n} life.`); } });
      return true;
    }
    case 'reproach': {
      const pid = tgt()?.player; if (pid === undefined) return true; const q = g.players[pid];
      once('p', () => { q.teferi = true; for (const c of [...q.battlefield]) if (!isType(c, 'Land')) phaseOut(g, c); log(g, `Until ${q.name}'s next turn, their life total can't change, they have protection from everything, and their nonland permanents phase out.`); });
      return true;
    }
    case 'jhoira': {
      const pid = tgt()?.player; if (pid === undefined) return true; const q = g.players[pid];
      const pack = held(g, key + ':' + pid, () => { const r = revealUntil(q, 1, historicPerm); return [...r.rest, ...r.hits]; });
      const hit = pack.find(historicPerm); const rest = pack.filter(c => c !== hit);
      once('r', () => { shuffle(g, rest); q.library.unshift(...rest); if (hit) { enter(g, hit, me, {}); const mv = cmc(def(hit)); if (mv) loseLife(g, me, mv); log(g, `${P.name} puts ${def(hit).name} onto the battlefield and loses ${mv} life.`); } log(g, `${q.name} reveals ${pack.map(c => def(c).name).join(', ') || 'nothing'}.`); });
      return true;
    }
    case 'venserCopy': {
      const orig = g.stack.find(s => s.id === tgt()?.stack && s.kind === 'spell' && s.card); if (!orig?.card) return true;
      const slots = orig.tslots ?? []; const ts0 = orig.targets ?? (orig.target ? [orig.target] : []);
      const change = ts0.some(t => t?.card !== undefined) && ask<boolean>(key + 'm', { pid: me, kind: 'may', text: `${srcName}: choose new targets for the copies of ${def(orig.card).name}?` });
      for (let i = 0; i < 2; i++) {
        const nts = !change ? ts0 : ts0.map((t, j) => {
          if (!t?.card || !slots[j]) return t;
          const cands = legalTargets(g, me, slots[j]).map(x => x.card !== undefined ? locate(g, x.card)?.c : undefined).filter((c): c is Card => !!c);
          if (cands.length <= 1) return t;
          const u = ask<number[]>(`${key}:${i}:${j}`, { pid: me, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'any', text: `Choose a target for copy ${i + 1} of ${def(orig.card!).name}.` });
          return { card: u[0] } as Target;
        });
        once(`c${i}`, () => { const card: Card = { ...orig.card!, uid: g.nextUid++, isCopy: true, token: isPermanentCard(def(orig.card!)) ? true : orig.card!.token }; g.stack.push({ ...orig, id: g.nextUid++, controller: me, card, targets: nts, target: nts.find(Boolean), label: `copy of ${orig.label}` }); log(g, `${P.name} copies ${def(orig.card!).name}.`); });
      }
      return true;
    }
    case 'venserTok': {
      const t = tgt()?.card !== undefined ? findCard(g, tgt()!.card!) : undefined; if (!t) return true;
      const n = 2 * (hasPStatic(g, [me], 'tokenDouble') ? 2 : 1) * (hasPStatic(g, [me], 'tokenTriple') && isType(t, 'Creature') ? 3 : 1);
      once('c', () => { for (let i = 0; i < n; i++) { const c = createToken(g, me, CARDS[t.origId ?? t.id] ? t.origId ?? t.id : t.id); c.kw = [...(c.kw ?? []), 'haste']; c.sick = false; delayEnd(g, ctx, `sacrifice the token copy of ${def(t).name}`, [{ op: 'sacUid', who: `uid:${c.uid}` }]); } log(g, `${P.name} creates ${n} hasty token cop${n === 1 ? 'y' : 'ies'} of ${def(t).name}.`); });
      return true;
    }
    case 'nivPay': {
      const n = ctx.item.event?.amount ?? 0; if (n <= 0 || P.teferi || P.life < n) return true;
      if (!ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: pay ${n} life? If you do, draw ${n} card${n === 1 ? '' : 's'}.` })) return true;
      once('p', () => { loseLife(g, me, n); draw(g, me, n); log(g, `${P.name} pays ${n} life and draws ${n}.`); });
      return true;
    }
    case 'tamiyoStun': {
      const s = findCard(g, ctx.item.sourceUid); if (!s || g.monarch !== me) return true;
      const tag = `${g.turn}:${g.step}`; if (s.stunTag === tag) return true;
      once('s', () => { s.stunTag = tag; for (const c of g.players.flatMap(p => p.battlefield).filter(c => c.hitVs === me)) { c.tapped = true; addCounters(g, c, 'stun', 1); log(g, `${def(c).name} is tapped and gets a stun counter.`); } });
      return true;
    }
    case 'urAttack': {
      const n = P.battlefield.filter(c => c.attacking !== undefined && isTypeOrSub(def(c), 'Sphinx')).length; if (!n) return true;
      const piles = held(g, key, () => g.players.filter(q => !q.lost).map(q => { const k = Math.min(n, q.library.length); const cards = q.library.splice(q.library.length - k, k); q.graveyard.push(...cards); log(g, `${q.name} mills ${cards.map(c => def(c).name).join(', ') || 'nothing'}.`); return cards; }));
      g.players.filter(q => !q.lost).forEach((q, i) => {
        const cards = (piles[i] ?? []).filter(c => q.graveyard.includes(c) && !isType(c, 'Land')); if (!cards.length) return;
        const u = cards.length === 1 && !P.human ? [cards[0].uid] : ask<number[]>(`${key}:p${q.id}`, { pid: me, kind: 'pick', cards, min: 0, max: 1, zone: 'graveyard', text: `${srcName}: you may cast a card ${q.name} milled this way without paying its mana cost.` });
        const c = cards.find(x => x.uid === u[0]); if (!c) return;
        c.mayPlay = g.turn; castNowStep(g, ctx, `${key}:c${q.id}`, me, c, true);
      });
      return true;
    }
    case 'sunfall': {
      const pack = held(g, key, () => { const n = g.players.flatMap(p => p.battlefield).filter(c => isType(c, 'Creature')).length; for (const c of g.players.flatMap(p => [...p.battlefield])) if (isType(c, 'Creature')) exileCard(g, c); return Array.from({ length: n }, () => ({ uid: -1 } as Card)); });
      once('t', () => { if (!pack.length) return; const tok = createToken(g, me, { name: 'Incubator', colors: [], types: ['Artifact'], sub: ['Incubator'], ext: { text: '{2}: Transform this token into a 0/0 Phyrexian artifact creature. It keeps its +1/+1 counters.', abilities: [{ label: 'Transform', mana: { generic: 2 }, effects: [{ op: 'script', kind: 'incubateFlip' }] }] } }); addCounters(g, tok, '+1/+1', pack.length); log(g, `${P.name} incubates ${pack.length}.`); });
      return true;
    }
    case 'incubateFlip': {
      const s = findCard(g, ctx.item.sourceUid); if (!s) return true;
      once('f', () => {
        const d: CardDef = { id: `phy-${s.uid}`, name: 'Phyrexian', types: ['Artifact', 'Creature'], sub: ['Phyrexian'], cost: { generic: 0 }, colors: [], power: 0, toughness: 0, text: '', token: true };
        CARDS[d.id] = d; s.origId ??= s.id; s.id = d.id; delete s.eff; log(g, `Incubator transforms into a Phyrexian.`);
      });
      return true;
    }
    case 'whiteSun': {
      const x = ctx.item.x ?? 0;
      once('w', () => {
        if (x) { gainLife(g, me, x); log(g, `${P.name} gains ${x} life.`); }
        const made: Card[] = []; for (let i = 0; i < x; i++) made.push(createToken(g, me, MITE));
        if (x >= 5) for (const c of g.players.flatMap(p => [...p.battlefield])) if (isType(c, 'Creature') && !made.includes(c)) destroy(g, c);
        if (x) log(g, `${P.name} creates ${x} Phyrexian Mite token${x === 1 ? '' : 's'}${x >= 5 ? ' and destroys every other creature' : ''}.`);
      });
      return true;
    }
    case 'fact': {
      const cards = held(g, key, () => P.library.splice(Math.max(0, P.library.length - 5), 5));
      if (!cards.length) return true;
      const opps = opponents(g, me); const foe = opps.length <= 1 ? opps[0]?.id ?? me : ask<number>(key + ':who', { pid: me, kind: 'player', players: opps.map(o => o.id), text: `${srcName}: choose an opponent to separate the cards into two piles.` });
      const pileA: number[] = [];
      for (const c of cards) { const pile = ask<string>(`${key}:pile:${c.uid}`, { pid: foe, kind: 'color', options: ['Pile A', 'Pile B'], text: `${srcName}: put ${def(c).name} into which pile?` }); if (pile === 'Pile A') pileA.push(c.uid); }
      const takeA = ask<string>(key + ':take', { pid: me, kind: 'color', options: ['Pile A', 'Pile B'], text: `${srcName}: put one pile into your hand. The other goes to your graveyard.` }) === 'Pile A';
      once('m', () => { for (const c of cards) { const hand = pileA.includes(c.uid) === takeA; (hand ? P.hand : P.graveyard).push(c); } log(g, `${P.name} puts ${cards.filter(c => (pileA.includes(c.uid) === takeA)).map(c => def(c).name).join(', ') || 'nothing'} into their hand.`); });
      return true;
    }
    case 'massPoly': {
      const pack = held(g, key, () => { const n = exileYours(g, me); const r = revealUntil(P, n, c => isType(c, 'Creature')); return [...r.hits, ...r.rest]; });
      const hits = pack.filter(c => P.library.indexOf(c) < 0 && !P.hand.includes(c) && !P.graveyard.includes(c) && !P.battlefield.includes(c) ? isType(c, 'Creature') : false);
      // hits are the revealed creatures still off to the side (not in a zone)
      const realHits = pack.filter(c => isType(c, 'Creature') && !g.players.some(q => q.library.includes(c) || q.battlefield.includes(c) || q.hand.includes(c) || q.graveyard.includes(c) || q.exile.includes(c) || q.command.includes(c)));
      const rest = pack.filter(c => !realHits.includes(c) && !g.players.some(q => [...q.library, ...q.battlefield, ...q.hand, ...q.graveyard, ...q.exile, ...q.command].includes(c)));
      once('p', () => dropCreatures(g, me, realHits.length ? realHits : hits, rest));
      return true;
    }
    case 'occult': {
      const x = ctx.item.x ?? 0;
      once('d', () => { if (x) { draw(g, me, x); log(g, `${P.name} draws ${x}.`); } });
      const n = Math.min(x, P.hand.length);
      const u = n ? ask<number[]>(key, { pid: me, kind: 'pick', cards: [...P.hand], min: n, max: n, zone: 'hand', text: `${srcName}: discard ${n} card${n === 1 ? '' : 's'}.` }) : [];
      once('s', () => {
        const cs = u.map(id => P.hand.find(c => c.uid === id)).filter((c): c is Card => !!c);
        const kinds = new Set<string>(); for (const c of cs) { discardCard(g, c); for (const t of typesOf(c)) kinds.add(t); }
        for (let i = 0; i < kinds.size; i++) createToken(g, me, SPIRIT);
        if (kinds.size) log(g, `${P.name} creates ${kinds.size} Spirit token${kinds.size === 1 ? '' : 's'} (${[...kinds].join(', ')}).`);
      });
      return true;
    }
    case 'shark': {
      const x = e.text === 'cycle' ? (ctx.item.event?.amount ?? ctx.item.evCard?.x ?? 0) : (ctx.item.evCard ? spellMv(ctx.item.evCard) : 0);
      once('s', () => { createToken(g, me, SHARK(x)); log(g, `${P.name} creates a ${x}/${x} Shark token.`); });
      return true;
    }
    case 'synth': {
      const count = held(g, key, () => exileYours(g, me));
      once('d', () => delayEnd(g, ctx, 'Synthetic Destiny', [{ op: 'script', kind: 'synthNow', n: count }]));
      return true;
    }
    case 'synthNow': {
      const n = typeof e.n === 'number' ? e.n : 0;
      const pack = held(g, key, () => { const r = revealUntil(P, n, c => isType(c, 'Creature')); return [...r.hits, ...r.rest]; });
      const hits = pack.filter(c => isType(c, 'Creature')).slice(0, n); const rest = pack.filter(c => !hits.includes(c));
      once('p', () => dropCreatures(g, me, hits, rest));
      return true;
    }
    case 'cursed': {
      const s = ctx.item.card; if (!s || s.origId) return true;
      const cands = g.players.flatMap(p => p.battlefield).filter(c => c !== s && isType(c, 'Creature')); if (!cands.length) return true;
      const u = ask<number[]>(key, { pid: me, kind: 'pick', cards: cands, min: 0, max: 1, zone: 'battlefield', text: `${srcName}: you may have it become a copy of a creature until end of turn. It has haste.` });
      const t = cands.find(c => c.uid === u[0]); if (!t) return true;
      once('c', () => { becomeCopy(g, s, t, { eot: true }); const d = CARDS[s.id]; if (d) d.keywords = [...new Set([...(d.keywords ?? []), 'haste'])]; });
      return true;
    }
    case 'windcrag': {
      const s = ctx.item.card; if (!s) return true;
      const mode = ask<string>(key, { pid: me, kind: 'color', options: ['Mardu', 'Jeskai'], text: `${srcName}: choose Mardu or Jeskai.` });
      once('m', () => { s.siege = mode === 'Mardu' ? 'mardu' : 'jeskai'; s.atkTwice = s.siege === 'mardu' || undefined; log(g, `${P.name} chooses ${mode}.`); });
      return true;
    }
    case 'windUp': {
      const s = findCard(g, ctx.item.sourceUid); if (!s || s.siege !== 'jeskai') return true;
      once('g', () => { const c = createToken(g, me, { ...GOBLIN, kws: ['lifelink', 'haste'] }); log(g, `${P.name} creates a Goblin with lifelink and haste.`); void c; });
      return true;
    }
    case 'proteus': {
      const c0 = tgt()?.card !== undefined ? findCard(g, tgt()!.card!) : undefined; if (!c0) return true;
      const oid = c0.owner; const q = g.players[oid];
      const pack = held(g, key, () => { moveCard(g, c0, 'bottom'); log(g, `${def(c0).name} is put on the bottom of its owner's library.`); const r = revealUntil(q, 1, x => isType(x, 'Creature')); return [...r.hits, ...r.rest]; });
      const hit = pack.find(c => isType(c, 'Creature')); const rest = pack.filter(c => c !== hit);
      const order = rest.length > 1 ? ask<{ order: number[] }>(key + ':o', { pid: oid, kind: 'orderTop', cards: rest, text: `${srcName}: put the other cards on the bottom of the library. The first card is closest to the top.` }).order : rest.map(c => c.uid);
      once('p', () => { if (hit) enter(g, hit, oid, {}); const ordered = order.map(id => rest.find(c => c.uid === id)).filter((c): c is Card => !!c); q.library.unshift(...[...ordered].reverse()); log(g, `${q.name} puts ${hit ? def(hit).name : 'nothing'} onto the battlefield.`); });
      return true;
    }
    case 'planTuck': {
      const c = tgt()?.card !== undefined ? findCard(g, tgt()!.card!) : undefined; if (!c) return true;
      const oid = c.realOwner ?? c.owner;
      const top = ask<string>(key, { pid: oid, kind: 'color', options: ['Top', 'Bottom'], text: `${srcName}: put ${def(c).name} on the top or the bottom of your library?` }) === 'Top';
      once('m', () => { moveCard(g, c, top ? 'top' : 'bottom'); log(g, `${def(c).name} is put on the ${top ? 'top' : 'bottom'} of its owner's library.`); });
      return true;
    }
    case 'fateBounce': {
      const t = tgt(); if (!t) return true;
      once('b', () => {
        if (t.stack !== undefined) { const it = g.stack.find(s => s.id === t.stack && s.card); if (!it?.card) return; g.stack = g.stack.filter(s => s !== it); g.players[it.card.owner].hand.push(it.card); log(g, `${def(it.card).name} returns to its owner's hand.`); return; }
        const c = t.card !== undefined ? findCard(g, t.card) : undefined; if (c) { moveCard(g, c, 'hand'); log(g, `${def(c).name} returns to its owner's hand.`); }
      });
      return true;
    }
    case 'serra': {
      const s = ctx.item.card; if (!s) return true;
      const ty = ask<string>(key, { pid: me, kind: 'color', options: CARD_TYPES, text: `${srcName}: choose a card type. You and creatures you control have protection from it.` });
      once('t', () => { s.protType = ty; log(g, `${P.name} chooses ${ty}.`); });
      return true;
    }
    default: return false;
  }
}
