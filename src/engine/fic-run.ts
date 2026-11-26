/** Runtime for FIC leftover scripts. Replay-safe via api.once / api.ask. */
import type { Card, CardDef, Effect, Game, TokenSpec } from './engine';
import {
  addCounters, becomeCopy, CARDS, cmc, createToken, ctr, def, dealDamage, draw, enter, exileCard, findCard,
  isType, locate, log, loseLife, moveCard, opponents, power, sacrifice, shuffle,
  alive, changeControl, pay,
} from './engine';
import type { FrcApi } from './frc';

const nm = (c: { id: string }) => def(c).name;
const srcCard = (g: Game, ctx: FrcApi['ctx']) => findCard(g, ctx.item.sourceUid);
const TREASURE: TokenSpec = { name: 'Treasure', colors: [], types: ['Artifact'], preset: 'Treasure' };
const SOLDIER: TokenSpec = { name: 'Soldier', p: 1, t: 1, colors: ['W'], types: ['Creature'], sub: ['Soldier'] };
const SPIRIT: TokenSpec = { name: 'Spirit', p: 1, t: 1, colors: ['W'], types: ['Creature'], sub: ['Spirit'], kws: ['flying'] };
const WIZARD: TokenSpec = { name: 'Wizard', p: 0, t: 1, colors: ['B'], types: ['Creature'], sub: ['Wizard'], ext: { text: 'Whenever you cast a noncreature spell, this creature deals 1 damage to each opponent.', triggers: [{ on: 'x', ev: 'cast', pl: 'you', filter: 'noncreature', label: '1 damage to each opponent', effects: [{ op: 'damage', n: 1, pl: 'opps' }] }] } };
const HERO: TokenSpec = { name: 'Hero', p: 1, t: 1, colors: [], types: ['Creature'], sub: ['Hero'] };

function tgt(g: Game, ctx: FrcApi['ctx'], i = 0): Card | undefined {
  const t = ctx.item.targets?.[i];
  if (t?.card !== undefined) return findCard(g, t.card) ?? locate(g, t.card)?.c;
  if (t?.player !== undefined) return undefined;
  return undefined;
}
function tgtPl(ctx: FrcApi['ctx'], i = 0): number | undefined { return ctx.item.targets?.[i]?.player; }
function evC(ctx: FrcApi['ctx']): Card | undefined { return ctx.item.evCard; }
function evX(ctx: FrcApi['ctx']): number { return ctx.item.x ?? evC(ctx)?.x ?? ctx.item.event?.amount ?? 0; }
function evPl(ctx: FrcApi['ctx']): number | undefined { return ctx.item.event?.player ?? ctx.item.evCard?.owner; }
function popTop(p: { library: Card[] }, n: number): Card[] {
  const k = Math.min(n, p.library.length);
  return p.library.splice(p.library.length - k, k).reverse();
}
function bf(g: Game) { return g.players.flatMap(p => p.battlefield); }
function equipped(g: Game, c: Card): boolean {
  return bf(g).some(x => x.attachedTo === c.uid && (def(x).sub ?? []).includes('Equipment'));
}
function kindsOn(c: Card): string[] { return Object.keys(c.counters ?? {}).filter(k => (c.counters?.[k] ?? 0) > 0); }
function allCtrs(c: Card): Record<string, number> { return { ...(c.counters ?? {}), ...(c.lastCtrs ?? {}) }; }

export function runFicLeftovers(kind: string, api: FrcApi): boolean {
  const { g, ctx, e, key, me, P, srcName, once, ask } = api;
  const src = srcCard(g, ctx);
  const n = typeof e.n === 'number' ? e.n : 0;

  switch (kind) {
    case 'terraReanim': {
      const c = tgt(g, ctx);
      if (!c) return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `Pay {2} to return ${nm(c)} tapped?` });
      if (yes && pay(g, P, { generic: 2 })) once('t', () => { moveCard(g, c, 'battlefield', { ctl: me, tapped: true }); log(g, `${P.name} returns ${nm(c)} tapped.`); });
      return true;
    }
    case 'celesLoot': {
      const n0 = P.hand.length;
      const pick = n0 ? ask<number[]>(key, { pid: me, kind: 'pick', cards: P.hand, min: 0, max: n0, zone: 'hand', text: 'Discard any number of cards, then draw that many plus one.' }) : [];
      once('c', () => {
        const cs = P.hand.filter(x => pick.includes(x.uid));
        for (const c of cs) { P.hand = P.hand.filter(x => x !== c); P.graveyard.push(c); c.discarded = g.turn as never; }
        draw(g, me, cs.length + 1);
        if (cs.length) log(g, `${P.name} discards ${cs.length}, then draws ${cs.length + 1}.`);
        else log(g, `${P.name} draws 1.`);
      });
      return true;
    }
    case 'celesCounters': {
      const evs: Card[] = (ctx.item as { evCards?: Card[] }).evCards ?? (evC(ctx) ? [evC(ctx)!] : []);
      const ok = evs.some(c => (c as Card & { fromZone?: string }).fromZone === 'graveyard' || c.castFrom === 'graveyard');
      if (!ok) return true;
      once('cc', () => { for (const c of P.battlefield.filter(x => isType(x, 'Creature'))) addCounters(g, c, '+1/+1', 1); log(g, `${srcName} puts a +1/+1 counter on each creature ${P.name} controls.`); });
      return true;
    }
    case 'cloudAtk': {
      once('cl', () => {
        const nEq = P.battlefield.filter(c => isType(c, 'Creature') && c.attacking !== undefined && equipped(g, c)).length;
        if (nEq) draw(g, me, nEq);
        if (src && power(g, src) >= 7) { for (let i = 0; i < 2; i++) createToken(g, me, TREASURE); log(g, `${P.name} creates two Treasures.`); }
      });
      return true;
    }
    case 'tifaCombat': {
      if ((g.combatsThisTurn ?? 1) === 1) {
        once('tf', () => { g.extraAfterCombat = (g.extraAfterCombat ?? 0) + 1; log(g, 'There is an additional combat phase after this phase.'); });
      }
      return true;
    }
    case 'tidusMove': {
      const a = tgt(g, ctx, 0), b = tgt(g, ctx, 1);
      if (!a || !b) return true;
      const kinds = kindsOn(a); if (!kinds.length) return true;
      const kind0 = kinds.length === 1 ? kinds[0] : (ask<string>(key, { pid: me, kind: 'pickstr', options: kinds, text: `Move which kind of counter from ${nm(a)}?` }) as string) ?? kinds[0];
      const yes = ask<boolean>(key + ':may', { pid: me, kind: 'may', text: `Move a ${kind0} counter from ${nm(a)} onto ${nm(b)}?` });
      if (yes) once('tm', () => { addCounters(g, a, kind0, -1); addCounters(g, b, kind0, 1); log(g, `${P.name} moves a ${kind0} counter.`); });
      return true;
    }
    case 'tidusCheer': {
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: 'Draw a card and proliferate?' });
      if (yes) once('tc', () => { draw(g, me, 1); /* proliferate via effect by adding 1 to each */ 
        for (const c of g.players.flatMap(p => p.battlefield)) for (const [k, v] of Object.entries(c.counters ?? {})) if (v > 0 && ((c.owner === me || /* ctl */ true) && (k !== '-1/-1' || c.owner !== me))) { /* simplified: use same rule as engine proliferate */ }
        for (const c of g.players.flatMap(p => p.battlefield)) for (const [k, v] of Object.entries(c.counters ?? {})) if (v > 0) {
          const you = (g.players[me].battlefield.includes(c));
          if ((you === (k !== '-1/-1'))) addCounters(g, c, k, 1);
        }
        for (const o of opponents(g, me)) if (o.poison) o.poison++;
        log(g, `${P.name} draws and proliferates.`);
      });
      return true;
    }
    case 'yunaSummon': {
      once('ys', () => { (P as Game['players'][number] & { yunaSummon?: number }).yunaSummon = g.turn; log(g, `The next creature ${P.name} casts this turn enters with two additional +1/+1 counters.`); });
      return true;
    }
    case 'yunaLegacy': {
      const ev = evC(ctx); const t = tgt(g, ctx);
      if (!ev || !t) return true;
      const nCtr = Object.values(ev.lastCtrs ?? ev.counters ?? {}).reduce((a, b) => a + b, 0);
      if (nCtr <= 0) return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `Put ${nCtr} +1/+1 counters on ${nm(t)}?` });
      if (yes) once('yl', () => { addCounters(g, t, '+1/+1', nCtr); log(g, `${P.name} puts ${nCtr} +1/+1 counters on ${nm(t)}.`); });
      return true;
    }
    case 'grahaGates': {
      const ev = evC(ctx); const x = ev ? cmc(def(ev)) : (ctx.item.event?.mv ?? 0);
      if (x < 0) return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `Pay ${x} life to create a Hero with ${x} +1/+1 counters?` });
      if (yes) once('gg', () => { loseLife(g, me, x); const tok = createToken(g, me, HERO); if (x > 0) addCounters(g, tok, '+1/+1', x); log(g, `${P.name} creates a Hero with ${x} +1/+1 counters.`); });
      return true;
    }
    case 'blueMageCast': {
      const c = tgt(g, ctx); if (!c) return true;
      once('bm', () => {
        const loc = locate(g, c.uid); if (!loc || loc.zone !== 'graveyard') return;
        exileCard(g, c);
        c.mayFree = g.turn; c.mayPlay = g.turn; (c as Card & { altCost?: { generic: number } }).altCost = { generic: 3 };
        log(g, `${P.name} exiles ${nm(c)} and may cast a copy by paying {3}.`);
        // simpler: allow playing the exiled card itself for {3} this turn (approx of 'cast the copy')
      });
      return true;
    }
    case 'reaperSoul': {
      once('rs', () => {
        let count = 0;
        for (const p of g.players) if (!p.lost && lifeLostThisTurn(p, g)) count++;
        if (count && src) { addCounters(g, src, 'soul', count); log(g, `${srcName} gets ${count} soul counters.`); }
      });
      return true;
    }
    case 'bladeBeam': {
      once('bb', () => {
        const tapped = bf(g).filter(c => isType(c, 'Creature') && c.tapped);
        const byCtl = new Map<number, Card[]>();
        for (const c of tapped) { const k = c.owner; const a = byCtl.get(k) ?? []; a.push(c); byCtl.set(k, a); }
        const chosen: Card[] = [];
        for (const [pid, cs] of byCtl) {
          if (cs.length === 1) chosen.push(cs[0]);
          else {
            const pick = ask<number[]>(key + ':' + pid, { pid: me, kind: 'pick', cards: cs, min: 0, max: 1, zone: 'battlefield', text: `Blade Beam: destroy a tapped creature ${g.players[pid].name} controls?` });
            const c = cs.find(x => pick.includes(x.uid)); if (c) chosen.push(c);
          }
        }
        for (const c of chosen) { moveCard(g, c, 'graveyard'); log(g, `${nm(c)} is destroyed.`); }
      });
      return true;
    }
    case 'omnislash': {
      once('om', () => { for (const c of [...bf(g)].filter(x => isType(x, 'Creature') && x.tapped)) { moveCard(g, c, 'graveyard'); log(g, `${nm(c)} is destroyed.`); } });
      return true;
    }
    case 'yuffieSteal': {
      const art = tgt(g, ctx);
      if (art && src) once('ysf', () => {
        const back = art.owner; changeControl(g, art, me);
        (g.steals ??= []).push({ uid: art.uid, back, src: src.uid } as { uid: number; back: number; src?: number });
        log(g, `${P.name} gains control of ${nm(art)} for as long as they control ${srcName}.`);
        const eqs = P.battlefield.filter(c => (def(c).sub ?? []).includes('Equipment'));
        if (eqs.length) {
          const pick = ask<number[]>(key + ':eq', { pid: me, kind: 'pick', cards: eqs, min: 0, max: 1, zone: 'battlefield', text: `Attach an Equipment to ${srcName}?` });
          const eq = eqs.find(x => pick.includes(x.uid));
          if (eq) { eq.attachedTo = src.uid; log(g, `${nm(eq)} is attached to ${srcName}.`); }
        }
      });
      return true;
    }

    // ----- leftover kinds (reprints & set cards) -----
    case 'archfiendSac': {
      const pid = evPl(ctx) ?? (ctx.item.event?.player); if (pid === undefined) return true;
      const q = g.players[pid]; const cr = q.battlefield.filter(c => isType(c, 'Creature'));
      if (cr.length <= 2) return true;
      const keep = ask<number[]>(key, { pid, kind: 'pick', cards: cr, min: 0, max: 2, zone: 'battlefield', text: 'Choose up to two creatures to keep; sacrifice the rest.' });
      once('af', () => { for (const c of cr.filter(x => !keep.includes(x.uid))) sacrifice(g, c); });
      return true;
    }
    case 'armoryAttach': {
      if (!src) return true;
      const eqs = bf(g).filter(c => (def(c).sub ?? []).includes('Equipment'));
      if (!eqs.length) return true;
      const pick = ask<number[]>(key, { pid: me, kind: 'pick', cards: eqs, min: 0, max: eqs.length, zone: 'battlefield', text: `Attach any number of Equipment to ${srcName}?` });
      once('aa', () => { for (const c of eqs.filter(x => pick.includes(x.uid))) { c.attachedTo = src.uid; log(g, `${nm(c)} is attached to ${srcName}.`); } });
      return true;
    }
    case 'baneProgress': {
      once('bp', () => {
        const ts = bf(g).filter(c => (isType(c, 'Artifact') || isType(c, 'Enchantment')) && c !== src);
        let nD = 0; for (const c of ts) { moveCard(g, c, 'graveyard'); nD++; }
        if (src && nD) addCounters(g, src, '+1/+1', nD);
        log(g, `${srcName} destroys ${nD} permanents.`);
      });
      return true;
    }
    case 'banonLoot': {
      const yes = P.hand.length && ask<boolean>(key, { pid: me, kind: 'may', text: 'Pay {1} and discard a card to draw a card?' });
      if (yes && pay(g, P, { generic: 1 })) {
        const pick = ask<number[]>(key + ':d', { pid: me, kind: 'pick', cards: P.hand, min: 1, max: 1, zone: 'hand', text: 'Discard a card.' });
        once('bl', () => { const c = P.hand.find(x => pick.includes(x.uid)); if (c) { P.hand = P.hand.filter(x => x !== c); P.graveyard.push(c); } draw(g, me, 1); });
      }
      return true;
    }
    case 'barretDmg': {
      once('bd', () => {
        const nEq = P.battlefield.filter(c => isType(c, 'Creature') && equipped(g, c)).length;
        const defId = src?.attacking; if (nEq && defId !== undefined) { dealDamage(g, (src!)?.id ?? ctx.item.sourceId, src!, { player: defId }, nEq); log(g, `${srcName} deals ${nEq} damage.`); }
      });
      return true;
    }
    case 'supportX': case 'supportN': {
      const k = kind === 'supportX' ? (ctx.item.card?.x ?? src?.x ?? evX(ctx) ?? 0) : (n || 2);
      const cr = P.battlefield.filter(c => isType(c, 'Creature'));
      const pick = cr.length ? ask<number[]>(key, { pid: me, kind: 'pick', cards: cr, min: 0, max: Math.min(2, cr.length), zone: 'battlefield', text: `Support ${k}: put ${k} +1/+1 counters distributed among up to two creatures.` }) : [];
      once('su', () => {
        const cs = cr.filter(x => pick.includes(x.uid)).slice(0, 2);
        if (cs.length === 1) addCounters(g, cs[0], '+1/+1', k);
        else if (cs.length === 2) { addCounters(g, cs[0], '+1/+1', Math.ceil(k / 2)); addCounters(g, cs[1], '+1/+1', Math.floor(k / 2)); }
      });
      return true;
    }
    case 'blitzGoal': {
      const t = tgt(g, ctx); if (!t) return true;
      once('bg', () => {
        (t as Card & { pkw?: string[] }).pkw = [...((t as Card & { pkw?: string[] }).pkw ?? []), "can't be blocked"];
        (t as Card & { ficGoal?: number }).ficGoal = g.turn;
        (g.watch ??= []).push({ ev: 'combatDamagePlayer', controller: me, sourceId: t.id, sourceUid: t.uid, label: 'draw for each kind of counter', effects: [{ op: 'script', kind: 'blitzGoalDraw' } as Effect], until: 'eot', by: me } as never);
        log(g, `${nm(t)} can't be blocked this turn and draws for counters on combat damage.`);
      });
      return true;
    }
    case 'blitzGoalDraw': {
      const ev = evC(ctx) ?? src; if (!ev) return true;
      const nK = kindsOn(ev).length; if (nK) once('bgd', () => draw(g, me, nK));
      return true;
    }
    case 'caitSlots': {
      const t = tgt(g, ctx);
      once('cs', () => {
        // scry 1
        if (P.library.length) {
          const top = P.library[P.library.length - 1];
          const keep = ask<boolean>(key + ':scry', { pid: me, kind: 'may', text: `Scry 1: keep ${nm(top)} on top? (No = put it on the bottom.)` });
          if (!keep) { P.library.pop(); P.library.unshift(top); }
        }
        const c = P.library.pop();
        if (c) {
          P.exile.push(c); c.mayPlay = g.turn;
          const mv = cmc(def(c));
          if (t && mv) { t.pp = (t.pp ?? 0) + mv; log(g, `${nm(t)} gets +${mv}/+0 until end of turn.`); }
          log(g, `${P.name} exiles ${nm(c)} and may play it this turn.`);
        }
      });
      return true;
    }
    case 'coinFate': {
      // two creature cards already exiled as cost; find the two most recently exiled creature cards by this
      once('cf', () => {
        const ex = P.exile.filter(c => isType(c, 'Creature')).slice(-2);
        if (ex.length < 2) { (P as { monarch?: boolean }); g.monarch = me; return; }
        const opp = opponents(g, me)[0];
        const pick = opp ? ask<number[]>(key, { pid: opp.id, kind: 'pick', cards: ex, min: 1, max: 1, zone: 'exile', text: 'Choose one card to put on the bottom; the other returns tapped.' }) : [ex[0].uid];
        const bottom = ex.find(c => pick.includes(c.uid)) ?? ex[0];
        const ret = ex.find(c => c !== bottom) ?? ex[1];
        P.exile = P.exile.filter(x => x !== bottom && x !== ret);
        P.library.unshift(bottom);
        enter(g, ret, me, { tapped: true });
        g.monarch = me;
        log(g, `${P.name} returns ${nm(ret)} and becomes the monarch.`);
      });
      return true;
    }
    case 'combustible': {
      const pid = tgtPl(ctx) ?? opponents(g, me)[0]?.id; if (pid === undefined) return true;
      const yes = ask<boolean>(key, { pid, kind: 'may', text: `${g.players[pid].name}: have ${P.name} draw three cards? (No: they mill three and ${srcName} deals damage.)` });
      once('cg', () => {
        if (yes) draw(g, me, 3);
        else {
          const milled = popTop(P, 3); P.graveyard.push(...milled);
          const dmg = milled.reduce((s, c) => s + cmc(def(c)), 0);
          if (src) dealDamage(g, (src)?.id ?? ctx.item.sourceId, src, { player: pid }, dmg);
          log(g, `${P.name} mills ${milled.map(nm).join(', ')}; ${srcName} deals ${dmg} damage.`);
        }
      });
      return true;
    }
    case 'conformerAtk': {
      const t = tgt(g, ctx); const atk = src; if (!t || !atk) return true;
      once('co', () => {
        t.tapped = true;
        const diff = power(g, t) - power(g, atk);
        if (diff > 0) { addCounters(g, atk, '+1/+1', diff); log(g, `${nm(atk)} gets ${diff} +1/+1 counters.`); }
      });
      return true;
    }
    case 'damningVerdict': {
      once('dv', () => { for (const c of [...bf(g)].filter(x => isType(x, 'Creature') && !kindsOn(x).length)) moveCard(g, c, 'graveyard'); });
      return true;
    }
    case 'demoField': {
      const land = tgt(g, ctx);
      once('df', () => {
        if (land) moveCard(g, land, 'graveyard');
        const searchBasic = (pid: number) => {
          const q = g.players[pid];
          const basics = q.library.filter(c => isType(c, 'Land') && ((def(c).sub ?? []).includes('Basic') || ['Plains','Island','Swamp','Mountain','Forest'].includes(def(c).name)));
          const ok = q.library.filter(c => isType(c, 'Land') && ((def(c).sub ?? []).some(s => ['Plains','Island','Swamp','Mountain','Forest','Wastes'].includes(s)) || def(c).types.includes('Basic') || (def(c).name && ['Plains','Island','Swamp','Mountain','Forest'].includes(def(c).name))));
          const pool = ok.length ? ok : q.library.filter(c => isType(c, 'Land') && (def(c).sub ?? []).includes('Basic'));
          if (!pool.length) { shuffle(g, q.library); return; }
          const yes = ask<boolean>(key + ':s' + pid, { pid, kind: 'may', text: 'Search for a basic land and put it onto the battlefield?' });
          if (!yes) { shuffle(g, q.library); return; }
          const pick = ask<number[]>(key + ':l' + pid, { pid, kind: 'pick', cards: pool, min: 1, max: 1, zone: 'library', text: 'Put a basic land onto the battlefield.' });
          const c = pool.find(x => pick.includes(x.uid));
          if (c) { q.library = q.library.filter(x => x !== c); enter(g, c, pid, {}); }
          shuffle(g, q.library);
        };
        if (land) searchBasic(land.owner);
        searchBasic(me);
      });
      return true;
    }
    case 'edgarTools': {
      once('et', () => {
        const mv = Math.max(0, ...P.battlefield.filter(c => isType(c, 'Artifact')).map(c => cmc(def(c))), 0);
        if (src && mv) { src.pp = (src.pp ?? 0) + mv; log(g, `${srcName} gets +${mv}/+0 until end of turn.`); }
      });
      return true;
    }
    case 'emetCast': {
      const c = tgt(g, ctx); if (!c) return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `Cast ${nm(c)} from your graveyard?` });
      if (yes) once('em', () => { c.mayFree = g.turn; c.mayPlay = g.turn;  log(g, `${P.name} may cast ${nm(c)}. If it would go to the graveyard, exile it instead.`); });
      return true;
    }
    case 'endlessDetour': {
      // Best-effort: target is on stack or we pick a card
      once('ed', () => {
        const c = tgt(g, ctx) ?? evC(ctx);
        if (!c) return;
        const owner = g.players[c.owner];
        const top = ask<boolean>(key, { pid: c.owner, kind: 'may', text: `Put ${nm(c)} on top of your library? (No = bottom.)` });
        const loc = locate(g, c.uid);
        if (loc?.zone === 'battlefield' || loc?.zone === 'graveyard' || loc?.zone === 'exile') {
          /* stack: mark to move */
        }
        moveCard(g, c, top ? 'top' : 'bottom');
      });
      return true;
    }
    case 'espersMagicite': {
      once('es', () => {
        const exiled: Card[] = [];
        for (const o of opponents(g, me)) { exiled.push(...o.graveyard); for (const c of [...o.graveyard]) exileCard(g, c); }
        const creatures = exiled.filter(c => isType(c, 'Creature'));
        const pick = creatures.length ? ask<number[]>(key, { pid: me, kind: 'pick', cards: creatures, min: 0, max: 1, zone: 'exile', text: 'Create a token copy of one exiled creature card (it becomes an artifact and loses other types)?' }) : [];
        const c = creatures.find(x => pick.includes(x.uid));
        if (c) {
          const tok = createToken(g, me, c.id);
          tok.addSub = [...(tok.addSub ?? [])];
          // mark as artifact-only types approximately
          log(g, `${P.name} creates a token copy of ${nm(c)} as an artifact.`);
        }
      });
      return true;
    }
    case 'estinienDraw': {
      once('ev', () => {
        let x = 0;
        for (const o of opponents(g, me)) {
          if ((o as { cdFrom?: number }).cdFrom === src?.uid) { x++; continue; }
          // tracked: combat damage this turn from src or a Dragon
          if ((o as { combatDmgT?: number }).combatDmgT === g.turn) x++;
        }
        // Use common field: players remember who damaged them
        x = opponents(g, me).filter(o => (o as unknown as { damagedBy?: number[] }).damagedBy?.includes(src?.uid ?? -1) || (o as { cDmgT?: number }).cDmgT === g.turn).length;
        // fallback: if src dealt combat damage this turn, count opponents flagged
        const dealt = (src as Card & { hitPl?: number[] })?.hitPl ?? [];
        const dragons = P.battlefield.filter(c => (def(c).sub ?? []).includes('Dragon') || def(c).types.includes('Dragon'));
        const nX = new Set<number>([...dealt, ...opponents(g, me).filter(o => o.life < 40).map(o => o.id).slice(0, 0)]).size;
        // simpler honest fallback: count opponents who lost life this combat/turn if we have a field; else 0+if src attacking faced them
        let n = 0;
        for (const o of opponents(g, me)) {
          if (lifeLostThisTurn(o, g) && (src?.atkT === g.turn || dragons.some(d => d.atkT === g.turn))) n++;
        }
        if (n) { draw(g, me, n); loseLife(g, me, n); log(g, `${P.name} draws ${n} and loses ${n} life.`); }
      });
      return true;
    }
    case 'explorerScope': {
      once('exs', () => {
        const c = P.library[P.library.length - 1]; if (!c) return;
        log(g, `${P.name} looks at ${nm(c)}.`);
        if (isType(c, 'Land')) {
          const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `Put ${nm(c)} onto the battlefield tapped?` });
          if (yes) { P.library.pop(); enter(g, c, me, { tapped: true }); }
        }
      });
      return true;
    }
    case 'fandaniel': {
      once('fa', () => {
        const nIS = P.graveyard.filter(c => isType(c, 'Instant') || isType(c, 'Sorcery')).length;
        for (const o of opponents(g, me)) {
          const nontok = o.battlefield.filter(c => isType(c, 'Creature') && !c.token);
          const yes = nontok.length ? ask<boolean>(key + ':' + o.id, { pid: o.id, kind: 'may', text: `Sacrifice a nontoken creature? If you don't, lose ${2 * nIS} life.` }) : false;
          if (yes) {
            const pick = ask<number[]>(key + ':s' + o.id, { pid: o.id, kind: 'pick', cards: nontok, min: 1, max: 1, zone: 'battlefield', text: 'Sacrifice a nontoken creature.' });
            const c = nontok.find(x => pick.includes(x.uid)); if (c) sacrifice(g, c);
          } else if (nIS) loseLife(g, o.id, 2 * nIS);
        }
      });
      return true;
    }
    case 'fightRigging': {
      const t = tgt(g, ctx);
      const big = P.battlefield.some(c => isType(c, 'Creature') && power(g, c) >= 7);
      if (big && src) {
        const ex = g.players.flatMap(p => p.exile.filter(c => c.exBy === src.uid));
        const c = ex[0];
        if (c) {
          const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `Play ${nm(c)} without paying its mana cost?` });
          if (yes) once('fr', () => { c.mayFree = g.turn; c.mayPlay = g.turn; delete c.faceDown; log(g, `${P.name} may play ${nm(c)} without paying its mana cost.`); });
        }
      }
      return true;
    }
    case 'flayerDmg': {
      const ev = evC(ctx);
      if (!ev || ((ev as Card & { fromZone?: string }).fromZone !== 'graveyard' && ev.castFrom !== 'graveyard' && ev !== src)) {
        // still trigger for self if it entered from gy; if unknown, only run when fromZone set or it's the Flayer itself entering? Oracle: enters from your graveyard
        if (!ev || (ev as Card & { fromZone?: string }).fromZone !== 'graveyard') return true;
      }
      const t = tgt(g, ctx);
      once('fl', () => { if (ev) dealDamage(g, ev.id, ev, t ? { card: t } : { player: tgtPl(ctx) ?? opponents(g, me)[0]?.id }, power(g, ev)); });
      return true;
    }
    case 'forgeHeroes': {
      const t = tgt(g, ctx); if (!t || t.enteredTurn !== g.turn) return true;
      once('fh', () => {
        if (isType(t, 'Creature')) addCounters(g, t, '+1/+1', 1);
        if (isType(t, 'Planeswalker')) addCounters(g, t, 'loyalty', 1);
      });
      return true;
    }
    case 'furiousRise': {
      once('fu', () => {
        const c = P.library.pop(); if (!c) return;
        P.exile.push(c); c.mayPlay = g.turn; c.exBy = src?.uid;
        // only until you exile another with this
        for (const x of P.exile) if (x !== c && x.exBy === src?.uid) delete x.mayPlay;
        log(g, `${P.name} exiles ${nm(c)} and may play it until they exile another card with ${srcName}.`);
      });
      return true;
    }
    case 'gattaPrevent': {
      const t = tgt(g, ctx); if (!t) return true;
      once('ga', () => { (t as Card & { preventToCtr?: number }).preventToCtr = g.turn; log(g, `Damage that would be dealt to ${nm(t)} this turn is prevented, and that many +1/+1 counters are put on it.`); });
      return true;
    }
    case 'gauRage': {
      if (!src) return true;
      once('gr', () => { for (const o of opponents(g, me)) dealDamage(g, src.id, src, { player: o.id }, power(g, src)); log(g, `${srcName} deals ${power(g, src)} damage to each opponent.`); });
      return true;
    }
    case 'patronDraw': {
      const ev = evC(ctx);
      if (ev && ev.owner !== me && !P.battlefield.includes(ev)) once('pd', () => draw(g, me, 1));
      return true;
    }
    case 'heideggerTok': {
      once('ht', () => {
        const nOpp = opponents(g, me).filter(o => o.battlefield.filter(c => isType(c, 'Creature')).length > P.battlefield.filter(c => isType(c, 'Creature')).length).length;
        for (let i = 0; i < nOpp; i++) createToken(g, me, SOLDIER);
        if (nOpp) log(g, `${P.name} creates ${nOpp} Soldier${nOpp > 1 ? 's' : ''}.`);
      });
      return true;
    }
    case 'hellkiteSteal': {
      const pid = evPl(ctx); if (pid === undefined) return true;
      once('hs', () => { for (const c of [...g.players[pid].battlefield].filter(x => isType(x, 'Artifact'))) { changeControl(g, c, me); log(g, `${P.name} gains control of ${nm(c)}.`); } });
      return true;
    }
    case 'hellkiteWin': {
      if (P.battlefield.filter(c => isType(c, 'Artifact')).length >= 20) once('hw', () => { g.winner = me; g.priority = null; log(g, `${P.name} wins the game!`); });
      return true;
    }
    case 'hildiAdventure': {
      once('hi', () => { if (src) { (src as Card & { advUntil?: number }).advUntil = g.turn + 1; src.mayPlay = g.turn + 1; log(g, `${P.name} may cast ${srcName} as an Adventure until the end of their next turn.`); } });
      return true;
    }
    case 'hraesvelgrAid': {
      const t = tgt(g, ctx); if (!t) return true;
      once('hr', () => { t.pp = (t.pp ?? 0) + 1; (t as Card & { pkw?: string[] }).pkw = [...((t as Card & { pkw?: string[] }).pkw ?? []), "can't be blocked"]; log(g, `${nm(t)} gets +1/+0 and can't be blocked this turn.`); });
      return true;
    }
    case 'interceptorRet': {
      if (!src || locate(g, src.uid)?.zone !== 'graveyard') return true;
      const legAtk = P.battlefield.some(c => isType(c, 'Creature') && c.attacking !== undefined && def(c).legendary);
      if (!legAtk) return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `Pay {2}{B} to return ${srcName} tapped and attacking?` });
      if (yes && pay(g, P, { generic: 2, B: 1 })) once('ir', () => {
        const vs = P.battlefield.find(c => c.attacking !== undefined)?.attacking;
        moveCard(g, src, 'battlefield', { ctl: me, tapped: true });
        if (vs !== undefined) { src.attacking = vs; src.atkT = g.turn; }
        log(g, `${srcName} returns tapped and attacking.`);
      });
      return true;
    }
    case 'kefkaCast': {
      once('kf', () => {
        const got: Card[] = [];
        for (const o of opponents(g, me)) if (o.graveyard.length) {
          const c = o.graveyard[Math.floor(Math.random() * o.graveyard.length)];
          exileCard(g, c); c.exBy = src?.uid; got.push(c);
        }
        for (const c of got) { c.mayFree = g.turn; c.mayPlay = g.turn; }
        if (got.length) log(g, `${P.name} may cast ${got.map(nm).join(', ')} without paying their mana costs.`);
      });
      return true;
    }
    case 'keyDraw': {
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: 'Pay {2} to draw a card?' });
      if (yes && pay(g, P, { generic: 2 })) once('kd', () => draw(g, me, 1));
      return true;
    }
    case 'kimahriCopy': {
      const t = tgt(g, ctx);
      const yes = t && ask<boolean>(key, { pid: me, kind: 'may', text: `Have ${srcName} become a copy of ${nm(t!)} (name stays Kimahri, has vigilance and this ability)?` });
      if (yes && t && src) once('ki', () => { becomeCopy(g, src, t, { name: def(src).name }); (src as Card & { pkw?: string[] }).pkw = [...((src as Card & { pkw?: string[] }).pkw ?? []), 'vigilance']; log(g, `${srcName} becomes a copy of ${nm(t)}.`); });
      return true;
    }
    case 'krileTrace': {
      const c = tgt(g, ctx); const ev = evC(ctx);
      if (!c || !ev || cmc(def(c)) !== cmc(def(ev))) return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `Return ${nm(c)} to your hand?` });
      if (yes) once('kt', () => { moveCard(g, c, 'hand'); });
      return true;
    }
    case 'legionsAshes': {
      const t = tgt(g, ctx); if (!t) return true;
      once('la', () => {
        const ctl = t.owner; const name = def(t).name;
        exileCard(g, t);
        for (const c of [...g.players[ctl].battlefield].filter(x => x.token && def(x).name === name)) exileCard(g, c);
      });
      return true;
    }
    case 'lifestream': {
      once('ls', () => {
        const x = Math.max(0, ...P.battlefield.filter(c => isType(c, 'Creature')).map(c => power(g, c)), 0);
        // "as you cast" — lki would be better; current BF is close
        if (x) draw(g, me, x);
        const fromExile = ctx.item.card?.castFrom === 'exile';
        if (fromExile && x) { /* gain 2x */ const { gain } = { gain: (n: number) => { P.life += n; log(g, `${P.name} gains ${n} life.`); } }; gain(2 * x); }
      });
      return true;
    }
    case 'lockeMug': {
      once('lm', () => {
        let land = false; const milled: Card[] = [];
        for (const p of g.players) { const c = p.library.pop(); if (c) { p.graveyard.push(c); milled.push(c); if (isType(c, 'Land')) land = true; } }
        if (land) createToken(g, me, TREASURE);
        for (const c of milled) { c.mayPlay = g.turn; }
        log(g, `${P.name} mills and may cast a spell from among those cards this turn.`);
      });
      return true;
    }
    case 'broodmoth': {
      const ev = evC(ctx); if (!ev || ev.token) return true;
      once('br', () => { const own = ev.owner; moveCard(g, ev, 'battlefield', { ctl: own }); addCounters(g, ev, 'flying', 1); log(g, `${nm(ev)} returns with a flying counter.`); });
      return true;
    }
    case 'seymourBoost': {
      const t = tgt(g, ctx); if (!t || !src) return true;
      once('sb', () => { addCounters(g, t, '+1/+1', power(g, src)); });
      return true;
    }
    case 'seymourMonstrosity': {
      if (!src || src.monstrous) return true;
      const x = P.battlefield.filter(c => isType(c, 'Creature')).reduce((s, c) => s + Object.values(c.counters ?? {}).reduce((a, b) => a + b, 0), 0);
      once('sm', () => { if (x > 0) addCounters(g, src, '+1/+1', x); src.monstrous = true; log(g, `${srcName} becomes monstrous.`); });
      return true;
    }
    case 'mogDance': {
      once('md', () => {
        const discarded: Card[] = [];
        for (const p of g.players) if (!p.lost && p.hand.length) {
          const yes = ask<boolean>(key + ':' + p.id, { pid: p.id, kind: 'may', text: 'Discard a card, then draw a card?' });
          if (yes) {
            const pick = ask<number[]>(key + ':d' + p.id, { pid: p.id, kind: 'pick', cards: p.hand, min: 1, max: 1, zone: 'hand', text: 'Discard a card.' });
            const c = p.hand.find(x => pick.includes(x.uid));
            if (c) { p.hand = p.hand.filter(x => x !== c); p.graveyard.push(c); discarded.push(c); draw(g, p.id, 1); }
          }
        }
        if (discarded.some(c => isType(c, 'Creature'))) createToken(g, me, { name: 'Moogle', p: 1, t: 2, colors: ['W'], types: ['Creature'], sub: ['Moogle'], kws: ['lifelink'] });
        if (discarded.some(c => !isType(c, 'Creature'))) for (const c of P.battlefield.filter(x => (def(x).sub ?? []).includes('Moogle'))) addCounters(g, c, '+1/+1', 1);
      });
      return true;
    }
    case 'moveCtr': {
      const a = tgt(g, ctx, 0), b = tgt(g, ctx, 1); if (!a || !b) return true;
      const kinds = kindsOn(a); if (!kinds.length) return true;
      const kind0 = kinds.length === 1 ? kinds[0] : (ask<string>(key, { pid: me, kind: 'pickstr', options: kinds, text: 'Move which kind of counter?' }) as string) ?? kinds[0];
      once('mc', () => { addCounters(g, a, kind0, -1); addCounters(g, b, kind0, 1); });
      return true;
    }
    case 'moveAnyCtrs': {
      const a = tgt(g, ctx, 0), b = tgt(g, ctx, 1); if (!a || !b) return true;
      once('ma', () => { for (const k of kindsOn(a)) { const n0 = a.counters![k]; addCounters(g, a, k, -n0); addCounters(g, b, k, n0); } });
      return true;
    }
    case 'oakaDraw': {
      const perms = P.battlefield.filter(c => !isType(c, 'Land') && kindsOn(c).length);
      if (!perms.length) return true;
      const pick = ask<number[]>(key, { pid: me, kind: 'pick', cards: perms, min: 1, max: 1, zone: 'battlefield', text: 'Remove a counter from a nonland permanent you control.' });
      const c = perms.find(x => pick.includes(x.uid)); if (!c) return true;
      const kinds = kindsOn(c); const k0 = kinds[0];
      once('oa', () => { addCounters(g, c, k0, -1); draw(g, me, 1); });
      return true;
    }
    case 'observedStasis': {
      const host = src && bf(g).find(c => src.attachedTo === c.uid);
      once('os', () => {
        if (host) { delete host.attacking; delete host.blocking; }
        const ctl = host?.owner ?? me;
        const nTap = g.players[ctl].battlefield.filter(c => isType(c, 'Creature') && c.tapped).length;
        if (nTap) draw(g, me, nTap);
      });
      return true;
    }
    case 'papalymo': {
      once('pa', () => {
        for (const o of opponents(g, me)) if (lifeLostThisTurn(o, g)) {
          const cr = o.battlefield.filter(c => isType(c, 'Creature'));
          if (!cr.length) continue;
          const mx = Math.max(...cr.map(c => power(g, c)));
          const cands = cr.filter(c => power(g, c) === mx);
          const pick = cands.length === 1 ? [cands[0].uid] : ask<number[]>(key + ':' + o.id, { pid: o.id, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'battlefield', text: 'Sacrifice a creature with the greatest power.' });
          const c = cands.find(x => pick.includes(x.uid)); if (c) sacrifice(g, c);
        }
      });
      return true;
    }
    case 'hojoDraw': { once('hd', () => draw(g, me, 1)); return true; }
    case 'adaptN': {
      if (!src) return true;
      const k = n || 3;
      if (!(src.counters?.['+1/+1'])) once('ad', () => addCounters(g, src, '+1/+1', k));
      return true;
    }
    case 'rampantSearch': {
      const x = evC(ctx)?.lki?.p ?? (src ? power(g, src) : 0);
      const basics = P.library.filter(c => isType(c, 'Land') && (['Plains','Island','Swamp','Mountain','Forest','Wastes'].includes(def(c).name) || (def(c).sub ?? []).some(s => ['Plains','Island','Swamp','Mountain','Forest'].includes(s))));
      const pick = basics.length ? ask<number[]>(key, { pid: me, kind: 'pick', cards: basics, min: 0, max: Math.min(x, basics.length), zone: 'library', text: `Put up to ${x} basic lands onto the battlefield.` }) : [];
      once('rj', () => { for (const c of basics.filter(x => pick.includes(x.uid))) { P.library = P.library.filter(y => y !== c); enter(g, c, me, {}); } shuffle(g, P.library); });
      return true;
    }
    case 'rejoinFight': {
      once('rf', () => {
        const gy = [...P.graveyard.filter(c => isType(c, 'Creature'))];
        const chosen: Card[] = [];
        const opps = opponents(g, me);
        // starting with the next opponent in turn order
        const start = (me + 1) % g.players.length;
        const order = [...g.players.slice(start), ...g.players.slice(0, start)].filter(p => p.id !== me && !p.lost);
        for (const o of order) {
          const left = gy.filter(c => !chosen.includes(c)); if (!left.length) break;
          const pick = ask<number[]>(key + ':' + o.id, { pid: o.id, kind: 'pick', cards: left, min: 1, max: 1, zone: 'graveyard', text: 'Choose a creature card in that graveyard.' });
          const c = left.find(x => pick.includes(x.uid)); if (c) chosen.push(c);
        }
        for (const c of chosen) { moveCard(g, c, 'battlefield', { ctl: me }); log(g, `${nm(c)} returns under ${P.name}'s control.`); }
      });
      return true;
    }
    case 'resDefMove': {
      const ev = evC(ctx); const t = tgt(g, ctx);
      const ctrs = ev?.lastCtrs; if (!ev || !t || !ctrs || !Object.values(ctrs).some(n => n > 0)) return true;
      once('rd', () => { for (const [k, n0] of Object.entries(ctrs)) if (n0 > 0) addCounters(g, t, k, n0); });
      return true;
    }
    case 'rikkuUnblock': {
      const ev = evC(ctx); if (!ev) return true;
      once('ru', () => { (ev as Card & { pkw?: string[] }).pkw = [...((ev as Card & { pkw?: string[] }).pkw ?? []), "can't be blocked"]; });
      return true;
    }
    case 'scholarPlains': {
      const perms = P.battlefield.filter(c => kindsOn(c).length);
      if (!perms.length) return true;
      const pickP = ask<number[]>(key, { pid: me, kind: 'pick', cards: perms, min: 1, max: 1, zone: 'battlefield', text: 'Remove a counter from a permanent you control.' });
      const host = perms.find(x => pickP.includes(x.uid)); if (!host) return true;
      const k0 = kindsOn(host)[0];
      const plains = P.library.filter(c => def(c).name === 'Plains' || (def(c).sub ?? []).includes('Plains'));
      once('sp', () => {
        addCounters(g, host, k0, -1);
        if (!plains.length) { shuffle(g, P.library); return; }
        const c = plains[0];
        const moreLands = opponents(g, me).some(o => o.battlefield.filter(x => isType(x, 'Land')).length > P.battlefield.filter(x => isType(x, 'Land')).length);
        if (moreLands) {
          const yes = ask<boolean>(key + ':bf', { pid: me, kind: 'may', text: `Put ${nm(c)} onto the battlefield tapped?` });
          if (yes) { P.library = P.library.filter(x => x !== c); enter(g, c, me, { tapped: true }); shuffle(g, P.library); return; }
        }
        P.library = P.library.filter(x => x !== c); P.hand.push(c); shuffle(g, P.library);
        log(g, `${P.name} puts ${nm(c)} into their hand.`);
      });
      return true;
    }
    case 'sephirothCells': {
      const t = tgt(g, ctx);
      once('sc', () => {
        if (t) addCounters(g, t, 'cell', 1);
        for (const c of P.battlefield.filter(x => isType(x, 'Creature') && isModified(g, x))) {
          (c as Card & { basePT?: { p: number; t: number; turn: number } }).basePT = { p: 7, t: 5, turn: g.turn };
        }
        log(g, 'Modified creatures you control have base power and toughness 7/5 until end of turn.');
      });
      return true;
    }
    case 'sephirothReunion': {
      if (!src || locate(g, src.uid)?.zone !== 'graveyard') return true;
      once('sr', () => { moveCard(g, src, 'battlefield', { ctl: me, tapped: true }); });
      return true;
    }
    case 'sepulchral': {
      once('sep', () => {
        for (const o of opponents(g, me)) {
          const cs = o.graveyard.filter(c => isType(c, 'Creature'));
          if (!cs.length) continue;
          const pick = ask<number[]>(key + ':' + o.id, { pid: me, kind: 'pick', cards: cs, min: 0, max: 1, zone: 'graveyard', text: `Return a creature from ${o.name}'s graveyard?` });
          const c = cs.find(x => pick.includes(x.uid)); if (c) moveCard(g, c, 'battlefield', { ctl: me });
        }
      });
      return true;
    }
    case 'setzerFlip': {
      once('sf', () => {
        const won = Math.random() < 0.5;
        log(g, `${P.name} flips a coin and ${won ? 'wins' : 'loses'}.`);
        if (won) {
          // fire winFlip
          const { emit } = { emit: (_g: Game, ev: string) => { /* deferred to engine hook */ } };
          (g as Game & { pendingFlip?: number }).pendingFlip = me;
        }
      });
      return true;
    }
    case 'shadowThrow': {
      const perms = P.battlefield.filter(c => c !== src && !isType(c, 'Land'));
      if (!perms.length) return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: 'Sacrifice another nonland permanent?' });
      if (!yes) return true;
      const pick = ask<number[]>(key + ':s', { pid: me, kind: 'pick', cards: perms, min: 1, max: 1, zone: 'battlefield', text: 'Sacrifice a nonland permanent.' });
      const c = perms.find(x => pick.includes(x.uid)); if (!c) return true;
      once('st', () => { const mv = cmc(def(c)); sacrifice(g, c); draw(g, me, 2); for (const o of opponents(g, me)) loseLife(g, o.id, mv); });
      return true;
    }
    case 'shelinda': {
      const ev = evC(ctx); if (!ev || !src) return true;
      once('sh', () => { addCounters(g, power(g, ev) < power(g, src) ? ev : src, '+1/+1', 1); });
      return true;
    }
    case 'siegfriedCtrs': {
      if (!src) return true;
      once('si', () => { const nC = P.graveyard.filter(c => isType(c, 'Creature')).length; if (nC) addCounters(g, src, '+1/+1', 2 * nC); });
      return true;
    }
    case 'sinDies': {
      const ev = evC(ctx) ?? src; const t = tgt(g, ctx);
      once('sd', () => {
        if (ev && t) for (const [k, n0] of Object.entries(ev.lastCtrs ?? ev.counters ?? {})) if (n0 > 0) addCounters(g, t, k, n0);
        if (ev) { const loc = locate(g, ev.uid); if (loc) { const q = g.players[ev.owner]; if (q.graveyard.includes(ev)) { q.graveyard = q.graveyard.filter(x => x !== ev); q.library.push(ev); shuffle(g, q.library); } } }
      });
      return true;
    }
    case 'snort': {
      once('sn', () => {
        const discarded: number[] = [];
        for (const p of g.players) if (!p.lost) {
          const yes = !p.hand.length ? false : ask<boolean>(key + ':' + p.id, { pid: p.id, kind: 'may', text: 'Discard your hand and draw five cards?' });
          if (yes) { const nH = p.hand.length; for (const c of [...p.hand]) { p.hand = p.hand.filter(x => x !== c); p.graveyard.push(c); } draw(g, p.id, 5); discarded.push(p.id); }
        }
        for (const pid of discarded) if (pid !== me) dealDamage(g, (src ?? { id: ctx.item.sourceId } as Card)?.id ?? ctx.item.sourceId, src ?? { id: ctx.item.sourceId } as Card, { player: pid }, 5);
      });
      return true;
    }
    case 'soldierP1': {
      const sols = P.battlefield.filter(c => (def(c).sub ?? []).includes('Soldier'));
      const pick = sols.length ? ask<number[]>(key, { pid: me, kind: 'pick', cards: sols, min: 0, max: Math.min(2, sols.length), zone: 'battlefield', text: 'Put a +1/+1 counter on each of up to two Soldiers.' }) : [];
      once('so', () => { for (const c of sols.filter(x => pick.includes(x.uid))) addCounters(g, c, '+1/+1', 1); });
      return true;
    }
    case 'stitchTogether': {
      const c = tgt(g, ctx); if (!c) return true;
      once('stg', () => { moveCard(g, c, P.graveyard.length >= 7 ? 'battlefield' : 'hand', { ctl: me }); });
      return true;
    }
    case 'stragoLore': {
      const pid = tgtPl(ctx) ?? opponents(g, me)[0]?.id; if (pid === undefined) return true;
      once('sl', () => {
        const o = g.players[pid]; const ex: Card[] = [];
        while (o.library.length) { const c = o.library.pop()!; o.exile.push(c); ex.push(c); if (isType(c, 'Instant') || isType(c, 'Sorcery') || isType(c, 'Creature')) break; }
        const last = ex[ex.length - 1];
        if (last && (isType(last, 'Instant') || isType(last, 'Sorcery') || isType(last, 'Creature'))) {
          last.mayFree = g.turn; last.mayPlay = g.turn;
          if (isType(last, 'Creature')) (last as Card & { stragoHaste?: boolean }).stragoHaste = true;
          log(g, `${P.name} may cast ${nm(last)} without paying its mana cost.`);
        }
      });
      return true;
    }
    case 'valiExile': {
      once('ve', () => {
        for (const p of g.players) if (!p.lost) {
          const cs = p.graveyard.filter(c => isType(c, 'Instant') || isType(c, 'Sorcery'));
          if (!cs.length) continue;
          const pick = ask<number[]>(key + ':' + p.id, { pid: me, kind: 'pick', cards: cs, min: 1, max: 1, zone: 'graveyard', text: `Exile an instant or sorcery from ${p.name}'s graveyard.` });
          const c = cs.find(x => pick.includes(x.uid)); if (c) { exileCard(g, c); c.exBy = src?.uid; }
        }
      });
      return true;
    }
    case 'valiCast': {
      if (src) once('vc', () => {
        const nLore = ctr(src, 'lore');
        (P as { ficManaR?: number }).ficManaR = ((P as { ficManaR?: number }).ficManaR ?? 0) + nLore;
        const ex = g.players.flatMap(p => p.exile.filter(c => c.exBy === src.uid && (isType(c, 'Instant') || isType(c, 'Sorcery'))));
        if (ex.length) {
          const pick = ask<number[]>(key, { pid: me, kind: 'pick', cards: ex, min: 0, max: 1, zone: 'exile', text: 'Cast an exiled instant or sorcery? Mana of any type can be spent.' });
          const c = ex.find(x => pick.includes(x.uid)); if (c) { c.mayPlay = g.turn; (c as Card & { anyMana?: boolean }).anyMana = true; }
        }
        log(g, `${P.name} adds {R} for each lore counter (${nLore}).`);
      });
      return true;
    }
    case 'mogCopyWatch': {
      once('mw', () => {
        (P as { mogCopyT?: number }).mogCopyT = g.turn;
        log(g, `Whenever ${P.name} casts a noncreature spell this turn, they create a token that's a copy of a non-Saga token they control.`);
      });
      return true;
    }
    case 'kujataFire': {
      if (!P.hand.length) return true;
      const pick = ask<number[]>(key, { pid: me, kind: 'pick', cards: P.hand, min: 1, max: 1, zone: 'hand', text: 'Discard a card, then draw two cards.' });
      once('kj', () => {
        const c = P.hand.find(x => pick.includes(x.uid)); if (!c) return;
        P.hand = P.hand.filter(x => x !== c); P.graveyard.push(c);
        draw(g, me, 2);
        const mv = cmc(def(c));
        if (src && mv) for (const o of opponents(g, me)) dealDamage(g, (src)?.id ?? ctx.item.sourceId, src, { player: o.id }, mv);
      });
      return true;
    }
    case 'magusSisters': {
      const mode = Math.floor(Math.random() * 3);
      once('ms', () => {
        const t0 = tgt(g, ctx, 0), t1 = tgt(g, ctx, 1);
        if (mode === 0 && t0) { addCounters(g, t0, '+1/+1', 3); log(g, 'Combine powers!'); }
        else if (mode === 1 && t0) { addCounters(g, t0, 'shield', 1); P.life += 3; log(g, 'Defense! You gain 3 life.'); }
        else if (mode === 2 && t1 && src) { dealDamage(g, src.id, src, { card: t1 }, power(g, src)); dealDamage(g, t1.id, t1, { card: src }, power(g, t1)); log(g, 'Fight!'); }
        else log(g, `Magus Sisters mode ${mode} has no legal target.`);
      });
      return true;
    }
    case 'valeforWings': {
      once('vw', () => {
        for (const o of opponents(g, me)) {
          const cr = o.battlefield.filter(c => isType(c, 'Creature')); if (!cr.length) continue;
          const mx = Math.max(...cr.map(c => cmc(def(c))));
          const cands = cr.filter(c => cmc(def(c)) === mx);
          const pick = cands.length === 1 ? [cands[0].uid] : ask<number[]>(key + ':' + o.id, { pid: o.id, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'battlefield', text: 'Choose a creature with the greatest mana value to return to your hand.' });
          const c = cands.find(x => pick.includes(x.uid)); if (c) moveCard(g, c, 'hand');
        }
      });
      return true;
    }
    case 'yojimboTax': {
      once('yt', () => { (g as Game & { yojimboTaxUntil?: number }).yojimboTaxUntil = g.turn + alive(g).length; log(g, 'Until your next turn, creatures can\'t attack you unless their controller pays {2} for each.'); });
      return true;
    }
    case 'yojimboTreasure': {
      once('yj', () => {
        const nT = opponents(g, me).filter(o => o.battlefield.some(c => isType(c, 'Creature') && power(g, c) >= 4)).length;
        for (let i = 0; i < nT; i++) createToken(g, me, TREASURE);
      });
      return true;
    }
    case 'summonerSend': {
      const c = tgt(g, ctx); if (!c) return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `Exile ${nm(c)} and create a Spirit?` });
      if (yes) once('ss', () => { exileCard(g, c); const tok = createToken(g, me, SPIRIT); if (cmc(def(c)) >= 4) addCounters(g, tok, '+1/+1', 1); });
      return true;
    }
    case 'thancredGuard': {
      const t = tgt(g, ctx); if (!t || !src) return true;
      once('tg', () => { (t as Card & { indUntilSrc?: number }).indUntilSrc = src.uid; (t as Card & { pkw?: string[] }).pkw = [...((t as Card & { pkw?: string[] }).pkw ?? []), 'indestructible']; log(g, `${nm(t)} has indestructible for as long as ${P.name} controls ${srcName}.`); });
      return true;
    }
    case 'triadMana': {
      const pid = tgtPl(ctx); if (pid === undefined) return true;
      once('tr', () => { (g.players[pid] as { ficManaAny?: number }).ficManaAny = ((g.players[pid] as { ficManaAny?: number }).ficManaAny ?? 0) + 1; log(g, `${g.players[pid].name} adds one mana of any color.`); });
      return true;
    }
    case 'togetherWatch': {
      const t = tgt(g, ctx); if (!t) return true;
      once('tw', () => { (t as Card & { retHandIfDies?: number }).retHandIfDies = g.turn; log(g, `When ${nm(t)} dies this turn, return it to its owner's hand.`); });
      return true;
    }
    case 'torrential': {
      const c = tgt(g, ctx); if (!c) return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `Cast ${nm(c)} without paying its mana cost?` });
      if (yes) once('to', () => { c.mayFree = g.turn; c.mayPlay = g.turn; log(g, `${P.name} may cast ${nm(c)}. If it would go to the graveyard, exile it instead.`); });
      return true;
    }
    case 'transposeTok': {
      const fromHand = ctx.item.card?.castFrom === 'hand' || !ctx.item.card?.castFrom;
      if (fromHand) once('tp', () => createToken(g, me, WIZARD));
      return true;
    }
    case 'tromellProlif': {
      const x = P.battlefield.filter(c => isType(c, 'Creature') && !c.token && c.enteredTurn === g.turn).length;
      once('tp2', () => {
        for (let i = 0; i < x; i++) {
          for (const c of g.players.flatMap(p => p.battlefield)) for (const [k, v] of Object.entries(c.counters ?? {})) if (v > 0) {
            const you = P.battlefield.includes(c);
            if (you === (k !== '-1/-1')) addCounters(g, c, k, 1);
          }
          for (const o of opponents(g, me)) if (o.poison) o.poison++;
        }
        if (x) log(g, `${P.name} proliferates ${x} time${x > 1 ? 's' : ''}.`);
      });
      return true;
    }
    case 'holyPrevent': {
      const fromExile = ctx.item.card?.castFrom === 'exile';
      if (fromExile) once('hp', () => { (P as { dmgShield?: boolean }).dmgShield = true; log(g, `Prevent all damage that would be dealt to ${P.name} this turn.`); });
      return true;
    }
    case 'meteorExtras': {
      const fromExile = ctx.item.card?.castFrom === 'exile';
      if (!fromExile) return true;
      once('me', () => {
        for (const o of opponents(g, me)) {
          const cs = o.battlefield.filter(c => isType(c, 'Artifact') || isType(c, 'Land'));
          if (!cs.length) continue;
          const pick = ask<number[]>(key + ':' + o.id, { pid: me, kind: 'pick', cards: cs, min: 1, max: 1, zone: 'battlefield', text: `Destroy an artifact or land ${o.name} controls.` });
          const c = cs.find(x => pick.includes(x.uid)); if (c) moveCard(g, c, 'graveyard');
        }
      });
      return true;
    }
    case 'umaroRandom': {
      const mode = Math.floor(Math.random() * 3);
      once('um', () => {
        if (mode === 0) { for (const c of P.battlefield.filter(x => isType(x, 'Creature') && x !== src)) { c.pp = (c.pp ?? 0) + 3; (c as Card & { pkw?: string[] }).pkw = [...((c as Card & { pkw?: string[] }).pkw ?? []), 'trample']; } log(g, 'Other creatures get +3/+0 and trample.'); }
        else if (mode === 1) { for (const c of [...P.hand]) { P.hand = P.hand.filter(x => x !== c); P.graveyard.push(c); } draw(g, me, 4); log(g, `${P.name} discards their hand and draws four.`); }
        else { const t = tgt(g, ctx); if (t) dealDamage(g, (src ?? t)?.id ?? ctx.item.sourceId, src ?? t, { card: findCard(g, t.uid) ?? locate(g, t.uid)?.c }, 5); else { const pid = tgtPl(ctx) ?? opponents(g, me)[0]?.id; if (pid !== undefined && src) dealDamage(g, (src)?.id ?? ctx.item.sourceId, src, { player: pid }, 5); } }
      });
      return true;
    }
    case 'unfinished': {
      const cr = tgt(g, ctx, 0); const a = tgt(g, ctx, 1); const b = tgt(g, ctx, 2);
      once('uf', () => {
        if (cr) moveCard(g, cr, 'battlefield', { ctl: me });
        for (const aura of [a, b]) if (aura && cr) { moveCard(g, aura, 'battlefield', { ctl: me }); aura.attachedTo = cr.uid; }
      });
      return true;
    }
    case 'uriLook': {
      const c = P.library[P.library.length - 1]; if (!c) return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `Exile ${nm(c)} face down?` });
      if (yes) once('ul', () => { P.library.pop(); P.exile.push(c); c.faceDown = true; c.exBy = src?.uid; });
      return true;
    }
    case 'uriPlay': {
      once('up', () => {
        for (const c of P.exile.filter(x => x.exBy === src?.uid)) { c.mayPlay = g.turn; c.faceDown = false; }
        (P as { uriLess?: number }).uriLess = g.turn;
        log(g, `${P.name} may play cards exiled with ${srcName} this turn. Those spells cost {2} less.`);
      });
      return true;
    }
    case 'vincentChaos': {
      if (!src || power(g, src) < 7) return true;
      const amt = evX(ctx) || (ctx.item.event?.amount ?? power(g, src));
      const hit = evPl(ctx);
      once('vc2', () => { for (const o of opponents(g, me)) if (o.id !== hit) dealDamage(g, (src)?.id ?? ctx.item.sourceId, src, { player: o.id }, amt); });
      return true;
    }
    case 'yunaPilgrim': {
      const cr = P.battlefield.filter(c => isType(c, 'Creature'));
      if (!cr.length) return true;
      const pick = ask<number[]>(key, { pid: me, kind: 'pick', cards: cr, min: 1, max: 1, zone: 'battlefield', text: 'Sacrifice a creature.' });
      const c = cr.find(x => pick.includes(x.uid)); if (!c) return true;
      once('yp', () => {
        sacrifice(g, c); draw(g, me, 1);
        const hand = P.hand.filter(x => isType(x, 'Creature') || isType(x, 'Land'));
        const put = hand.length ? ask<number[]>(key + ':put', { pid: me, kind: 'pick', cards: hand, min: 0, max: Math.min(2, hand.length), zone: 'hand', text: 'You may put a creature card and/or a land card from your hand onto the battlefield.' }) : [];
        const chosen = hand.filter(x => put.includes(x.uid));
        const cre = chosen.find(x => isType(x, 'Creature')); const land = chosen.find(x => isType(x, 'Land') && x !== cre);
        for (const x of [cre, land]) if (x) { P.hand = P.hand.filter(y => y !== x); enter(g, x, me, {}); }
      });
      return true;
    }
    case 'yunaWhistle': {
      const t = tgt(g, ctx);
      once('yw', () => {
        const revealed: Card[] = []; let hit: Card | undefined;
        while (P.library.length) { const c = P.library.pop()!; revealed.push(c); if (isType(c, 'Creature')) { hit = c; break; } }
        if (hit) { P.hand.push(hit); const rest = revealed.filter(x => x !== hit); for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; } P.library.unshift(...rest);
          if (t) addCounters(g, t, '+1/+1', cmc(def(hit)));
        } else { for (let i = revealed.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [revealed[i], revealed[j]] = [revealed[j], revealed[i]]; } P.library.unshift(...revealed); }
      });
      return true;
    }
    case 'zackPass': {
      const t = tgt(g, ctx); const z = evC(ctx) ?? src;
      once('zp', () => {
        if (z && t) {
          for (const [k, n0] of Object.entries(z.lastCtrs ?? z.counters ?? {})) if (n0 > 0) addCounters(g, t, k, n0);
          const eq = bf(g).find(c => c.attachedTo === z.uid && (def(c).sub ?? []).includes('Equipment')) ?? g.players.flatMap(p => [...p.graveyard, ...p.battlefield]).find(c => (c as Card).attachedTo === z.uid);
          // equipment attached to Zack should still be on BF with attachedTo
          const eqs = bf(g).filter(c => (def(c).sub ?? []).includes('Equipment') && (c.attachedTo === z.uid ));
          const eq0 = eqs[0]; if (eq0) { eq0.attachedTo = t.uid; log(g, `${nm(eq0)} attaches to ${nm(t)}.`); }
        }
      });
      return true;
    }
    default:
      return false;
  }
}

function lifeLostThisTurn(p: Game['players'][number], g: Game): boolean {
  const r = p as unknown as Record<string, unknown>;
  for (const k of ['lifeLostThisTurn', 'lostLife', 'lostLifeT', 'llT', 'lifeLostT']) {
    const v = r[k];
    if (typeof v === 'number' && (v === g.turn || v > 0) && !(k.endsWith('T') && v !== g.turn && v < 100)) {
      if (k.endsWith('T') || k.endsWith('Turn')) return v === g.turn;
      if (v > 0) return true;
    }
  }
  return !!(p as { lifeLostThisTurn?: number }).lifeLostThisTurn;
}
function isModified(g: Game, c: Card): boolean {
  if (kindsOn(c).length) return true;
  return bf(g).some(x => x.attachedTo === c.uid);
}
