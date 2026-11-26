/** Runtime for EOC leftover scripts. Replay-safe via api.once / api.ask. */
import type { Card, Game } from './engine';
import {
  addCounters, addDelayed, amt, CARDS, cmc, createToken, ctr, ctl, def, dealDamage, draw, enter, exileCard,
  findCard, isType, layer, locate, log, loseLife, moveCard, opponents, pay, phaseOut, power, sacrifice,
  shuffle,
} from './engine';
import type { FrcApi } from './frc';
import type { CardDef, Color } from './types';

const nm = (c: { id: string }) => def(c).name;
const evC = (ctx: FrcApi['ctx']): Card | undefined => ctx.item.evCard;
function tgt(g: Game, ctx: FrcApi['ctx'], i = 0): Card | undefined {
  const t = ctx.item.targets?.[i];
  if (t?.card !== undefined) return findCard(g, t.card) ?? locate(g, t.card)?.c;
  return undefined;
}
function tgtPl(ctx: FrcApi['ctx'], i = 0): number | undefined { return ctx.item.targets?.[i]?.player; }
function srcOf(g: Game, ctx: FrcApi['ctx']) { return findCard(g, ctx.item.sourceUid); }
function allBf(g: Game): Card[] { return g.players.flatMap(p => p.battlefield); }
function totalCtrs(c: Card): number {
  return Object.values(c.counters ?? {}).reduce((s, n) => s + (n > 0 ? n : 0), 0);
}
function popTop(p: { library: Card[] }, n: number): Card[] {
  const k = Math.min(n, p.library.length);
  return p.library.splice(p.library.length - k, k).reverse();
}

export function runEocLeftovers(kind: string, api: FrcApi): boolean {
  const { g, ctx, e, key, me, P, srcName, once, ask } = api;
  switch (kind) {
    case 'inspiritCtr': {
      const c = tgt(g, ctx);
      if (!c) break;
      const pick = ask<string>(key, { pid: me, kind: 'color', options: ['+1/+1 counter', 'two charge counters'], text: `${srcName}: put a +1/+1 counter or two charge counters on ${nm(c)}?` });
      if (pick && pick.startsWith('two')) addCounters(g, c, 'charge', 2);
      else addCounters(g, c, '+1/+1', 1);
      log(g, `${srcName} puts ${pick && pick.startsWith('two') ? 'two charge counters' : 'a +1/+1 counter'} on ${nm(c)}.`);
      break;
    }
    case 'tekuthalInd': {
      const s = srcOf(g, ctx); if (!s) break;
      const cands = P.battlefield.filter(c => c !== s && (isType(c, 'Artifact') || isType(c, 'Creature') || isType(c, 'Planeswalker')) && totalCtrs(c) > 0);
      let need = 3;
      once('r', () => { /* counters removed below */ });
      while (need > 0 && cands.some(c => totalCtrs(c) > 0)) {
        const withCtr = cands.filter(c => totalCtrs(c) > 0);
        const u = withCtr.length === 1 ? withCtr[0].uid : ask<number[]>(`${key}:c${need}`, { pid: me, kind: 'pick', cards: withCtr, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: remove a counter (${need} left).` })[0];
        const c = withCtr.find(x => x.uid === u) ?? withCtr[0];
        const kinds = Object.entries(c.counters ?? {}).filter(([, n]) => n > 0).map(([k]) => k);
        const knd = kinds.length === 1 ? kinds[0] : ask<string>(`${key}:k${need}:${c.uid}`, { pid: me, kind: 'color', options: kinds, text: `${srcName}: remove which kind of counter from ${nm(c)}?` });
        addCounters(g, c, knd, -1); need--;
      }
      if (need === 0) { addCounters(g, s, 'indestructible', 1); log(g, `${srcName} gets an indestructible counter.`); }
      break;
    }
    case 'ripplesPhase': {
      const t = g.turn;
      const hit = allBf(g).filter(c => ctl(c) === me && c.gotCtrT === t);
      if (!hit.length) break;
      const pick = ask<number[]>(key, { pid: me, kind: 'pick', cards: hit, min: 0, max: hit.length, zone: 'battlefield', text: `${srcName}: permanents that got a counter this way phase out.` });
      for (const u of pick) { const c = hit.find(x => x.uid === u); if (c) phaseOut(g, c); }
      break;
    }
    case 'solarGrant': {
      once('g', () => { P.solarGrantT = g.turn; log(g, `${srcName}: the next artifact spell you cast this turn gains sunburst.`); });
      break;
    }
    case 'grantSunburst': {
      const ev = evC(ctx) ?? g.stack.filter(s => s.kind === 'spell' && s.controller === me).slice(-1)[0]?.card;
      if (ev) { ev.gainedSunburst = true; log(g, `${nm(ev)} gains sunburst.`); }
      break;
    }
    case 'luxBoom': {
      const n = P.battlefield.filter(c => isType(c, 'Artifact') || isType(c, 'Creature')).reduce((s, c) => s + totalCtrs(c), 0);
      if (n < 30) break;
      once('d', () => { for (const o of opponents(g, me)) dealDamage(g, ctx.item.sourceId, srcOf(g, ctx), { player: o.id }, 10); log(g, `${srcName} deals 10 damage to each opponent.`); });
      break;
    }
    case 'fumigate': {
      const cs = allBf(g).filter(c => isType(c, 'Creature'));
      let n = 0;
      once('d', () => {
        for (const c of cs) { if (!findCard(g, c.uid)) continue; moveCard(g, c, 'graveyard'); n++; }
        if (n) { P.life += n; P.gained += n; log(g, `${srcName} destroys ${n} creature${n === 1 ? '' : 's'}. ${P.name} gains ${n} life.`); }
      });
      break;
    }
    case 'planetary': {
      once('p', () => {
        for (const q of g.players) {
          const lands = q.battlefield.filter(c => isType(c, 'Land'));
          if (lands.length <= 6) continue;
          const keep = q.human
            ? ask<number[]>(`${key}:${q.id}`, { pid: q.id, kind: 'pick', cards: lands, min: 6, max: 6, zone: 'battlefield', text: `${srcName}: choose six lands to keep.` })
            : lands.slice(0, 6).map(c => c.uid);
          for (const c of lands) if (!keep.includes(c.uid)) sacrifice(g, c);
        }
      });
      break;
    }
    case 'wastewaker': {
      const defP = evC(ctx)?.attacking ?? opponents(g, me)[0]?.id;
      const pids = [me, defP].filter((x): x is number => x !== undefined);
      let lands = 0;
      for (const pid of pids) {
        const q = g.players[pid];
        const perms = q.battlefield.slice();
        const doSac = !q.hand.length || ask<boolean>(`${key}:s${pid}`, { pid, kind: 'may', text: `${srcName}: sacrifice a permanent? (Otherwise discard a card.)` });
        if (doSac && perms.length) {
          const u = perms.length === 1 ? perms[0].uid : ask<number[]>(`${key}:p${pid}`, { pid, kind: 'pick', cards: perms, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: sacrifice a permanent.` })[0];
          const c = perms.find(x => x.uid === u) ?? perms[0];
          const wasLand = isType(c, 'Land');
          sacrifice(g, c);
          if (wasLand) lands++;
        } else if (q.hand.length) {
          const u = q.hand.length === 1 ? q.hand[0].uid : ask<number[]>(`${key}:d${pid}`, { pid, kind: 'pick', cards: q.hand, min: 1, max: 1, zone: 'hand', text: `${srcName}: discard a card.` })[0];
          const c = q.hand.find(x => x.uid === u) ?? q.hand[0];
          const wasLand = isType(c, 'Land');
          q.hand = q.hand.filter(x => x !== c); q.graveyard.push(c); c.fromBfT = undefined;
          log(g, `${q.name} discards ${nm(c)}.`);
          if (wasLand) lands++;
        }
      }
      if (lands) { draw(g, me, lands); log(g, `${P.name} draws ${lands} (land cards put into a graveyard).`); }
      break;
    }
    case 'evendoExile': {
      const top = popTop(P, 1)[0];
      if (!top) break;
      const src = srcOf(g, ctx);
      P.exile.push(top); top.exBy = src?.uid; top.mayPlay = g.turn;
      P.sacNontokenT = g.turn;
      log(g, `${srcName} exiles ${nm(top)}.`);
      break;
    }
    case 'hatchery': {
      const ev = evC(ctx);
      const n = ev ? (ev.lastCtrs?.hatchling ?? ev.counters?.hatchling ?? 0) : 0;
      if (n <= 0) break;
      once('t', () => {
        const tok = { name: 'Insect', p: 1, t: 1, colors: ['B' as Color], types: ['Creature'], sub: ['Insect'], kws: ['flying'] };
        for (let i = 0; i < n; i++) createToken(g, me, tok);
        log(g, `${srcName} creates ${n} Insect token${n === 1 ? '' : 's'}.`);
      });
      break;
    }
    case 'scouring': {
      const lands = P.graveyard.filter(c => isType(c, 'Land')).length;
      once('t', () => {
        if (lands >= 7) {
          const src = srcOf(g, ctx); if (!src) return;
          const id = src.id;
          createToken(g, me, id, { tapped: true });
          log(g, `${srcName} creates a tapped token copy of itself.`);
        } else {
          createToken(g, me, { name: 'Insect', p: 1, t: 1, colors: ['B' as Color], types: ['Creature'], sub: ['Insect'], kws: ['flying'] }, { tapped: true });
          log(g, `${srcName} creates a tapped Insect token.`);
        }
      });
      break;
    }
    case 'formless': {
      const x = g.players.reduce((s, q) => s + q.graveyard.filter(c => isType(c, 'Land')).length, 0);
      // X is lands in *your* graveyard
      const n = P.graveyard.filter(c => isType(c, 'Land')).length;
      once('t', () => {
        const d: CardDef = { id: `tok-formless-${g.nextUid}`, name: 'Shapeshifter', types: ['Creature'], sub: ['Shapeshifter'], cost: { generic: 0 }, colors: [], power: n, toughness: n, text: '', keywords: ['changeling'], token: true };
        // changeling is handled as keyword if the engine supports it; grant all creature types via changeling kw
        CARDS[d.id] = { ...d, keywords: ['changeling'] };
        const tok = { name: 'Shapeshifter', p: n, t: n, colors: [] as Color[], types: ['Creature'], sub: ['Shapeshifter'], kws: ['changeling', 'deathtouch'] };
        createToken(g, me, tok);
        log(g, `${srcName} creates a ${n}/${n} Shapeshifter with changeling and deathtouch.`);
      });
      break;
    }
    case 'gitrogSac': {
      const src = srcOf(g, ctx); if (!src) break;
      const lands = P.battlefield.filter(c => isType(c, 'Land'));
      const payLand = lands.length > 0 && ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: sacrifice a land? If you don't, sacrifice ${nm(src)}.` });
      if (payLand) {
        const u = lands.length === 1 ? lands[0].uid : ask<number[]>(key + ':l', { pid: me, kind: 'pick', cards: lands, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: sacrifice a land.` })[0];
        const c = lands.find(x => x.uid === u) ?? lands[0];
        sacrifice(g, c);
      } else sacrifice(g, src);
      break;
    }
    case 'moraugUntap': {
      once('u', () => { addDelayed(g, ctx, { at: 'beginCombat', pid: me, label: 'Untap all creatures you control', effects: [{ op: 'untap', who: { all: { types: ['Creature'], ctrl: 'you' } } }] }); });
      break;
    }
    case 'windgraceLand': {
      const c = tgt(g, ctx);
      if (!c || locate(g, c.uid)?.zone !== 'graveyard') break;
      if (!ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: put ${nm(c)} onto the battlefield tapped?` })) break;
      moveCard(g, c, 'battlefield', { tapped: true, ctl: me });
      log(g, `${P.name} puts ${nm(c)} onto the battlefield tapped.`);
      break;
    }
    case 'discLand': {
      const lands = P.hand.filter(c => isType(c, 'Land'));
      if (!lands.length) break;
      const u = lands.length === 1 ? lands[0].uid : ask<number[]>(key, { pid: me, kind: 'pick', cards: lands, min: 1, max: 1, zone: 'hand', text: `${srcName}: discard a land card.` })[0];
      const c = lands.find(x => x.uid === u) ?? lands[0];
      P.hand = P.hand.filter(x => x !== c); P.graveyard.push(c);
      log(g, `${P.name} discards ${nm(c)}.`);
      break;
    }
    case 'loamcrafter': {
      const lands = P.hand.filter(c => isType(c, 'Land'));
      if (!lands.length) break;
      if (!ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: discard one or more land cards?` })) break;
      const pick = ask<number[]>(key + ':d', { pid: me, kind: 'pick', cards: lands, min: 1, max: lands.length, zone: 'hand', text: `${srcName}: discard one or more land cards.` });
      const discarded: Card[] = [];
      for (const u of pick) { const c = lands.find(x => x.uid === u); if (c) { P.hand = P.hand.filter(x => x !== c); P.graveyard.push(c); discarded.push(c); } }
      if (!discarded.length) break;
      log(g, `${P.name} discards ${discarded.map(nm).join(', ')}.`);
      const gy = P.graveyard.filter(c => !isType(c, 'Land') && !['Instant', 'Sorcery'].some(t => def(c).types.includes(t)));
      if (!gy.length) break;
      const ret = ask<number[]>(key + ':r', { pid: me, kind: 'pick', cards: gy, min: 0, max: Math.min(discarded.length, gy.length), zone: 'graveyard', text: `${srcName}: return up to ${discarded.length} nonland permanent card(s) to your hand.` });
      for (const u of ret) { const c = gy.find(x => x.uid === u); if (c) { P.graveyard = P.graveyard.filter(x => x !== c); P.hand.push(c); log(g, `${nm(c)} returns to ${P.name}'s hand.`); } }
      break;
    }
    case 'vinecrasher': {
      const src = evC(ctx);
      const self = locate(g, ctx.item.sourceUid)?.c;
      if (!self || locate(g, self.uid)?.zone !== 'graveyard') break;
      if (!ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: pay {G}{G} to return it to your hand?` })) break;
      if (!pay(g, P, { generic: 0, G: 2 })) break;
      const z = locate(g, self.uid); if (!z || z.zone !== 'graveyard') break;
      z.p.graveyard = z.p.graveyard.filter(x => x !== self); z.p.hand.push(self);
      log(g, `${nm(self)} returns to ${P.name}'s hand.`);
      void src;
      break;
    }
    case 'escapeWilds': {
      const top = popTop(P, 5);
      once('e', () => {
        for (const c of top) { P.exile.push(c); c.mayPlay = g.turn + 1; c.playBy = me; log(g, `${P.name} exiles ${nm(c)}.`); }
      });
      break;
    }
    case 'braids': {
      const types = ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker'] as const;
      const cands = P.battlefield.filter(c => types.some(t => isType(c, t)));
      if (!cands.length || !ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: sacrifice an artifact, creature, enchantment, land, or planeswalker?` })) break;
      const u = cands.length === 1 ? cands[0].uid : ask<number[]>(key + ':s', { pid: me, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: sacrifice a permanent.` })[0];
      const c = cands.find(x => x.uid === u) ?? cands[0];
      const shared = types.filter(t => isType(c, t));
      sacrifice(g, c);
      for (const o of opponents(g, me)) {
        const opts = o.battlefield.filter(x => shared.some(t => isType(x, t)));
        const yes = opts.length > 0 && ask<boolean>(`${key}:o${o.id}`, { pid: o.id, kind: 'may', text: `${srcName}: sacrifice a permanent that shares a type with ${nm(c)}? If you don't, you lose 2 life and ${P.name} draws a card.` });
        if (yes) {
          const ou = opts.length === 1 ? opts[0].uid : ask<number[]>(`${key}:op${o.id}`, { pid: o.id, kind: 'pick', cards: opts, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: sacrifice a permanent.` })[0];
          sacrifice(g, opts.find(x => x.uid === ou) ?? opts[0]);
        } else { loseLife(g, o.id, 2); draw(g, me, 1); log(g, `${o.name} loses 2 life and ${P.name} draws a card.`); }
      }
      break;
    }
    case 'myriadLand': {
      const basics = P.library.filter(c => def(c).basic && isType(c, 'Land'));
      if (!basics.length) { shuffle(g, P.library); break; }
      const pick = ask<number[]>(key, { pid: me, kind: 'pick', cards: basics, min: 0, max: 2, zone: 'library', text: `${srcName}: up to two basic lands that share a land type.` });
      const cs = pick.map(u => basics.find(c => c.uid === u)).filter((x): x is Card => !!x);
      const share = (a: Card, b: Card) => (def(a).sub ?? []).some(s => ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].includes(s) && def(b).sub?.includes(s));
      if (cs.length === 2 && !share(cs[0], cs[1])) { cs.pop(); }
      for (const c of cs) { P.library = P.library.filter(x => x !== c); enter(g, c, me, { tapped: true }); }
      shuffle(g, P.library);
      if (cs.length) log(g, `${P.name} puts ${cs.map(nm).join(' and ')} onto the battlefield tapped.`);
      break;
    }
    case 'windgraceJudge': {
      once('j', () => {
        for (const o of opponents(g, me)) {
          const perms = o.battlefield.filter(c => !isType(c, 'Land'));
          if (!perms.length) continue;
          const u = perms.length === 1 ? perms[0].uid : ask<number[]>(`${key}:${o.id}`, { pid: me, kind: 'pick', cards: perms, min: 0, max: 1, zone: 'battlefield', text: `${srcName}: destroy a nonland permanent ${o.name} controls?` })[0];
          const c = perms.find(x => x.uid === u);
          if (c) { moveCard(g, c, 'graveyard'); log(g, `${nm(c)} is destroyed.`); }
        }
      });
      break;
    }
    case 'worldsoul': {
      const x = typeof e.n === 'number' ? e.n : (ctx.item.x ?? 0);
      const n = amt(g, ctx, 'X') || x;
      const pool = [...P.hand, ...P.graveyard].filter(c => isType(c, 'Land'));
      if (!pool.length || n <= 0) break;
      const pick = ask<number[]>(key, { pid: me, kind: 'pick', cards: pool, min: 0, max: Math.min(n, pool.length), zone: 'hand', text: `${srcName}: put up to ${n} land card(s) from your hand and/or graveyard onto the battlefield tapped.` });
      for (const u of pick) {
        const c = pool.find(x => x.uid === u); if (!c) continue;
        moveCard(g, c, 'battlefield', { tapped: true, ctl: me });
        log(g, `${P.name} puts ${nm(c)} onto the battlefield tapped.`);
      }
      break;
    }
    case 'bontuSac': {
      const src = srcOf(g, ctx);
      const cands = P.battlefield.filter(c => c !== src);
      const pick = cands.length ? ask<number[]>(key, { pid: me, kind: 'pick', cards: cands, min: 0, max: cands.length, zone: 'battlefield', text: `${srcName}: sacrifice any number of other permanents, then draw that many cards.` }) : [];
      let n = 0;
      for (const u of pick) { const c = cands.find(x => x.uid === u); if (c) { sacrifice(g, c); n++; } }
      if (n) draw(g, me, n);
      break;
    }
    case 'bontuLib': {
      const ev = evC(ctx) ?? locate(g, ctx.item.sourceUid)?.c;
      if (!ev) break;
      if (!ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: put her into her owner's library third from the top?` })) break;
      const loc = locate(g, ev.uid); if (!loc) break;
      const owner = ev.realOwner ?? ev.owner;
      moveCard(g, ev, 'library' as never, { quiet: true } as never);
      const L = g.players[owner].library;
      const i = L.indexOf(ev);
      if (i >= 0) { L.splice(i, 1); L.splice(Math.max(0, L.length - 2), 0, ev); }
      else L.splice(Math.max(0, L.length - 2), 0, ev);
      log(g, `${nm(ev)} is put into ${g.players[owner].name}'s library third from the top.`);
      break;
    }
    case 'metamorph': {
      const s = ctx.item.card; if (!s || s.origId) break;
      const cands = allBf(g).filter(c => (isType(c, 'Artifact') || isType(c, 'Creature')) && c.uid !== s.uid);
      if (!cands.length) break;
      if (!ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: have it enter as a copy of an artifact or creature?` })) break;
      const u = cands.length === 1 ? cands[0].uid : ask<number[]>(key + ':c', { pid: me, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: copy which artifact or creature?` })[0];
      const t = cands.find(x => x.uid === u) ?? cands[0];
      const base = CARDS[t.origId ?? t.id] ?? def(t);
      const id = `${base.id}#meta${s.uid}`;
      const types = [...new Set([...base.types, 'Artifact'])];
      CARDS[id] = { ...base, id, types };
      s.origId = s.id; s.id = id;
      log(g, `${srcName} enters as a copy of ${nm(t)}, except it's an artifact.`);
      break;
    }
    case 'mycosynth': {
      const t = tgt(g, ctx); const s = srcOf(g, ctx);
      if (!t || !s) break;
      if (cmc(def(t)) !== (ctx.item.x ?? 0)) break;
      const base = CARDS[t.origId ?? t.id] ?? def(t);
      const id = `${base.id}#myc${s.uid}`;
      CARDS[id] = { ...base, id };
      s.origId = s.id; s.id = id;
      layer(g);
      log(g, `${nm(s)} becomes a copy of ${base.name}.`);
      break;
    }
    case 'cloudKey': {
      const s = ctx.item.card ?? srcOf(g, ctx); if (!s) break;
      const ty = ask<string>(key, { pid: me, kind: 'ctype', options: ['Artifact', 'Creature', 'Enchantment', 'Instant', 'Sorcery'], text: `${srcName}: choose artifact, creature, enchantment, instant, or sorcery.` });
      s.chosenType = ty;
      log(g, `${srcName}: the chosen type is ${ty}.`);
      break;
    }
    case 'seedshark': {
      const ev = evC(ctx) ?? g.stack.filter(s => s.kind === 'spell' && s.controller === me).slice(-1)[0]?.card;
      const x = ev ? cmc(def(ev)) : (ctx.item.event?.mv ?? 0);
      if (x <= 0) break;
      once('i', () => {
        const tok = createToken(g, me, { name: 'Incubator', colors: [] as Color[], types: ['Artifact'], sub: ['Incubator'] });
        // Prefer the FRC incubator if registered
        addCounters(g, tok, '+1/+1', x);
        log(g, `${srcName} incubates ${x}.`);
      });
      break;
    }
    case 'deepglow': {
      const cands = allBf(g).filter(c => totalCtrs(c) > 0);
      if (!cands.length) break;
      const pick = ask<number[]>(key, { pid: me, kind: 'pick', cards: cands, min: 0, max: cands.length, zone: 'battlefield', text: `${srcName}: double the counters on any number of permanents.` });
      for (const u of pick) {
        const c = cands.find(x => x.uid === u); if (!c) continue;
        for (const [k, n] of Object.entries(c.counters ?? {})) if (n > 0) addCounters(g, c, k, n);
      }
      break;
    }
    case 'depthshaker': {
      const cands = P.battlefield.filter(c => isType(c, 'Artifact') && !isType(c, 'Creature'));
      if (!cands.length) break;
      const pick = ask<number[]>(key, { pid: me, kind: 'pick', cards: cands, min: 0, max: cands.length, zone: 'battlefield', text: `${srcName}: any number of noncreature artifacts become 3/3 creatures until end of turn, then are sacrificed.` });
      for (const u of pick) {
        const c = cands.find(x => x.uid === u); if (!c) continue;
        c.anim = { p: 3, t: 3, perm: false, ts: g.turn };
        addDelayed(g, ctx, { at: 'endStep', pid: me, label: `Sacrifice ${nm(c)}`, effects: [{ op: 'sacUid', who: `uid:${c.uid}` } as never] });
        log(g, `${nm(c)} becomes a 3/3 artifact creature.`);
      }
      layer(g);
      break;
    }
    case 'alibou': {
      const atk = allBf(g).filter(c => c.attacking !== undefined && ctl(c) === me && isType(c, 'Artifact') && isType(c, 'Creature'));
      if (!atk.length) break;
      const x = P.battlefield.filter(c => isType(c, 'Artifact') && c.tapped).length;
      if (x <= 0) break;
      const t = tgt(g, ctx); const pl = tgtPl(ctx);
      dealDamage(g, ctx.item.sourceId, srcOf(g, ctx), t ? { card: t } : { player: pl }, x);
      // scry x: left as a scry effect if the engine supports pushing scry
      ctx.item.effects = [...(ctx.item.effects ?? []), { op: 'scry', n: x, pl: 'you' } as never];
      log(g, `${srcName} deals ${x} damage and its controller scries ${x}.`);
      break;
    }
    case 'emry': {
      const c = tgt(g, ctx);
      if (!c || locate(g, c.uid)?.zone !== 'graveyard') break;
      c.mayPlay = g.turn;
      log(g, `${P.name} may cast ${nm(c)} this turn.`);
      break;
    }
    case 'exileGy': {
      const pid = tgtPl(ctx); if (pid === undefined) break;
      const q = g.players[pid];
      const cs = q.graveyard.slice();
      once('e', () => { for (const c of cs) { q.graveyard = q.graveyard.filter(x => x !== c); q.exile.push(c); } if (cs.length) log(g, `${q.name}'s graveyard is exiled.`); });
      break;
    }
    case 'rakdosCharm3': {
      once('d', () => {
        for (const c of allBf(g).filter(x => isType(x, 'Creature'))) {
          dealDamage(g, c.id, c, { player: ctl(c) }, 1);
        }
      });
      break;
    }
    case 'gavelEquip': {
      const s = srcOf(g, ctx); if (!s) break;
      const canRem = totalCtrs(s) > 0;
      const pay3 = !canRem || ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: pay {3}? If you don't, remove a counter from it.` });
      if (pay3) {
        if (!pay(g, P, { generic: 3 })) {
          if (canRem) {
            const kinds = Object.entries(s.counters ?? {}).filter(([, n]) => n > 0).map(([k]) => k);
            addCounters(g, s, kinds[0], -1);
          }
        }
      } else if (canRem) {
        const kinds = Object.entries(s.counters ?? {}).filter(([, n]) => n > 0).map(([k]) => k);
        const knd = kinds.length === 1 ? kinds[0] : ask<string>(key + ':k', { pid: me, kind: 'color', options: kinds, text: `${srcName}: remove which kind of counter?` });
        addCounters(g, s, knd, -1);
      }
      break;
    }
    case 'multaniRet': {
      const lands = P.battlefield.filter(c => isType(c, 'Land'));
      if (lands.length < 2) break;
      const pick = ask<number[]>(key, { pid: me, kind: 'pick', cards: lands, min: 2, max: 2, zone: 'battlefield', text: `${srcName}: return two lands you control to their owners' hands.` });
      if (pick.length < 2) break;
      for (const u of pick) { const c = lands.find(x => x.uid === u); if (c) moveCard(g, c, 'hand'); }
      const self = locate(g, ctx.item.sourceUid)?.c;
      if (self && locate(g, self.uid)?.zone === 'graveyard') {
        const loc = locate(g, self.uid)!;
        loc.p.graveyard = loc.p.graveyard.filter(x => x !== self);
        loc.p.hand.push(self);
        log(g, `${nm(self)} returns to ${P.name}'s hand.`);
      }
      break;
    }
    default:
      return false;
  }
  return true;
}

void evC;
