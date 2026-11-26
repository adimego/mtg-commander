/** Runtime for ECC leftover scripts. Replay-safe via api.once / api.ask. */
import type { Card, Game } from './engine';
import {
  addCounters, addDelayed, amt, CARDS, castNowStep, changeControl, cmc, createToken, ctr, def, dealDamage,
  draw, enter, exileCard, findCard, isPermanentCard, isType, isTypeOrSub, layer, locate, log, loseLife, moveCard,
  opponents, pay, power, sacrifice, shuffle, toughness,
} from './engine';
import type { FrcApi } from './frc';

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
function popTop(p: { library: Card[] }, n: number): Card[] {
  const k = Math.min(n, p.library.length);
  return p.library.splice(p.library.length - k, k).reverse();
}
function totalCtrs(c: Card): number {
  return Object.values(c.counters ?? c.lastCtrs ?? {}).reduce((s, n) => s + (n > 0 ? n : 0), 0);
}

export function runEccLeftovers(kind: string, api: FrcApi): boolean {
  const { g, ctx, e, key, me, P, srcName, once, ask } = api;
  switch (kind) {
    case 'ashlingCopy': {
      const ev = evC(ctx);
      if (!ev || ev.token || !isTypeOrSub(def(ev), 'Elemental')) break;
      once('c', () => {
        const tok: Card = { uid: g.nextUid++, id: ev.id, owner: me, tapped: false, sick: true, damage: 0, pp: 0, pt: 0, token: true };
        enter(g, tok, me, {});
        (tok.kw ??= []).push('haste');
        log(g, `${srcName} creates a token copy of ${nm(ev)} with haste.`);
        addDelayed(g, ctx, {
          at: 'endStep', pid: me, label: `sacrifice ${nm(tok)} unless you pay {W}{U}{B}{R}{G}`,
          effects: [{ op: 'script', kind: 'ashlingSacUnless', n: tok.uid }],
        });
      });
      break;
    }
    case 'ashlingSacUnless': {
      const uid = e.n as number;
      const c = findCard(g, uid);
      if (!c) break;
      const cost = { generic: 0, W: 1, U: 1, B: 1, R: 1, G: 1 };
      const payIt = ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: pay {W}{U}{B}{R}{G} to keep ${nm(c)}?` });
      if (payIt) {
        if (!pay(g, P, cost)) { sacrifice(g, c); log(g, `${P.name} can't pay and sacrifices ${nm(c)}.`); }
        else log(g, `${P.name} pays {W}{U}{B}{R}{G} to keep ${nm(c)}.`);
      } else { sacrifice(g, c); log(g, `${P.name} sacrifices ${nm(c)}.`); }
      break;
    }
    case 'impulsivity': {
      const c = tgt(g, ctx);
      if (!c || locate(g, c.uid)?.zone !== 'graveyard') break;
      c.exileAfter = true;
      const cast = castNowStep(g, ctx, `${key}:cast`, me, c, true);
      if (!cast) delete c.exileAfter;
      break;
    }
    case 'subterfugeGrant': {
      const c = tgt(g, ctx);
      if (!c) break;
      once('g', () => {
        (g.watch ??= []).push({ ev: 'combatDamagePlayer', uid: c.uid, controller: me, until: 'eot', effects: [{ op: 'script', kind: 'subterfugeHit' }] } as never);
      });
      break;
    }
    case 'subterfugeHit': {
      const n = ctx.item.event?.amount ?? 0;
      if (n > 0) { draw(g, me, n); log(g, `${P.name} draws ${n} (Subterfuge).`); }
      break;
    }
    case 'enduranceGy': {
      const pid = tgtPl(ctx);
      if (pid === undefined) break;
      const q = g.players[pid];
      once('e', () => { shuffle(g, q.graveyard); q.library.unshift(...q.graveyard); q.graveyard = []; log(g, `${q.name} puts their graveyard on the bottom of their library.`); });
      break;
    }
    case 'divideDmg': {
      const n = amt(g, ctx, e.n ?? 0);
      const cs = (ctx.item.targets ?? []).map((t, i) => tgt(g, ctx, i)).filter((c): c is Card => !!c && (isType(c, 'Creature') || isType(c, 'Planeswalker')));
      if (n <= 0 || !cs.length) break;
      const src = srcOf(g, ctx);
      let left = n;
      for (let i = 0; i < cs.length; i++) {
        const share = i === cs.length - 1 ? left : Math.max(1, Math.floor(left / (cs.length - i)));
        if (share <= 0) break;
        dealDamage(g, ctx.item.sourceId, src, { card: cs[i] }, share);
        left -= share;
      }
      break;
    }
    case 'hauntingVoyage': {
      const typ = ctx.item.card?.chosenType ?? srcOf(g, ctx)?.chosenType;
      if (!typ) break;
      const all = P.graveyard.filter(c => isType(c, 'Creature') && isTypeOrSub(def(c), typ));
      const foretold = !!ctx.item.card?.foretold || ctx.item.card?.castFrom === 'exile';
      if (foretold) {
        once('a', () => { for (const c of [...all]) moveCard(g, c, 'battlefield', { ctl: me }); log(g, `${P.name} returns ${all.map(nm).join(', ') || 'nothing'} (foretold).`); });
      } else {
        const pick = ask<number[]>(key, { pid: me, kind: 'pick', cards: all, min: 0, max: Math.min(2, all.length), zone: 'graveyard', text: `${srcName}: return up to two ${typ} creature cards.` });
        once('r', () => { for (const u of pick) { const c = all.find(x => x.uid === u); if (c) moveCard(g, c, 'battlefield', { ctl: me }); } });
      }
      break;
    }
    case 'selvalaDraw': {
      const ev = evC(ctx); if (!ev) break;
      const pw = ev.lki?.p ?? power(g, ev);
      const others = allBf(g).filter(c => c.uid !== ev.uid && isType(c, 'Creature'));
      if (others.some(c => power(g, c) >= pw)) break;
      const pid = ev.owner;
      const yes = ask<boolean>(key, { pid, kind: 'may', text: `Selvala: ${g.players[pid].name} may draw a card.` });
      if (yes) draw(g, pid, 1);
      break;
    }
    case 'shatterSky': {
      once('d', () => {
        for (const q of g.players) if (q.battlefield.some(c => isType(c, 'Creature') && power(g, c) >= 4)) { draw(g, q.id, 1); log(g, `${q.name} draws a card (Shatter the Sky).`); }
      });
      break;
    }
    case 'slithermuse': {
      const opps = opponents(g, me);
      if (!opps.length) break;
      const pid = opps.length === 1 ? opps[0].id : ask<number>(key, { pid: me, kind: 'player', players: opps.map(o => o.id), text: `${srcName}: choose an opponent.` });
      const q = g.players[pid];
      const n = q.hand.length - P.hand.length;
      if (n > 0) { draw(g, me, n); log(g, `${P.name} draws ${n} (Slithermuse).`); }
      break;
    }
    case 'descendantsFury': {
      const hit = allBf(g).filter(c => c.owner === me && isType(c, 'Creature') && c.hitVs !== undefined);
      const evs = ((ctx.item as { evCards?: Card[] }).evCards ?? (evC(ctx) ? [evC(ctx)!] : hit)).filter(c => findCard(g, c.uid));
      const cands = evs.length ? evs : hit;
      if (!cands.length) break;
      const yes = ask<boolean>(`${key}:may`, { pid: me, kind: 'may', text: `${srcName}: sacrifice one of those creatures?` });
      if (!yes) break;
      const uid = cands.length === 1 ? cands[0].uid : ask<number[]>(`${key}:sac`, { pid: me, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: sacrifice one of them.` })[0];
      const sac = cands.find(c => c.uid === uid);
      if (!sac) break;
      const typ = def(sac).sub ?? [];
      sacrifice(g, sac);
      const seen: Card[] = [];
      let hitC: Card | undefined;
      once('r', () => {
        while (P.library.length) {
          const c = P.library.pop()!;
          if (isType(c, 'Creature') && typ.some(t => isTypeOrSub(def(c), t))) { hitC = c; break; }
          seen.push(c);
        }
        if (hitC) { enter(g, hitC, me, {}); log(g, `${P.name} puts ${nm(hitC)} onto the battlefield.`); }
        shuffle(g, seen); P.library.unshift(...seen);
      });
      break;
    }
    case 'creamCrop': {
      const ev = evC(ctx); if (!ev) break;
      const x = ev.lki?.p ?? power(g, ev);
      if (x <= 0) break;
      const yes = ask<boolean>(`${key}:may`, { pid: me, kind: 'may', text: `${srcName}: look at the top ${x}?` });
      if (!yes) break;
      const top = popTop(P, x);
      if (!top.length) break;
      const pick = top.length === 1 ? [top[0].uid] : ask<number[]>(`${key}:top`, { pid: me, kind: 'pick', cards: top, min: 1, max: 1, zone: 'library', text: `${srcName}: put one on top.` });
      const keep = top.find(c => c.uid === pick[0]) ?? top[0];
      const rest = top.filter(c => c !== keep);
      once('c', () => { P.library.push(keep); P.library.unshift(...rest); log(g, `${P.name} puts ${nm(keep)} on top and the rest on the bottom.`); });
      break;
    }
    case 'kindredSummons': {
      const typ = ctx.item.card?.chosenType ?? srcOf(g, ctx)?.chosenType;
      if (!typ) break;
      const x = P.battlefield.filter(c => isType(c, 'Creature') && isTypeOrSub(def(c), typ)).length;
      const seen: Card[] = []; const hits: Card[] = [];
      once('k', () => {
        while (P.library.length && hits.length < x) {
          const c = P.library.pop()!;
          if (isType(c, 'Creature') && isTypeOrSub(def(c), typ)) hits.push(c);
          else seen.push(c);
        }
        for (const c of hits) enter(g, c, me, {});
        P.library.push(...seen); shuffle(g, P.library);
        log(g, `${P.name} puts ${hits.map(nm).join(', ') || 'no creatures'} onto the battlefield (Kindred Summons).`);
      });
      break;
    }
    case 'faeburrowMana': {
      const cols = new Set(P.battlefield.flatMap(c => def(c).colors));
      once('m', () => { for (const k of ['W', 'U', 'B', 'R', 'G'] as const) if (cols.has(k)) P.pool.push(k); log(g, `${P.name} adds ${[...cols].map(k => `{${k}}`).join('') || 'no mana'} (Faeburrow Elder).`); g.lastMana = [...cols]; });
      break;
    }
    case 'hordePlay': {
      const c = tgt(g, ctx);
      if (!c || locate(g, c.uid)?.zone !== 'graveyard') break;
      c.mayPlay = g.turn;
      const cast = castNowStep(g, ctx, `${key}:cast`, me, c, true);
      if (!cast) delete c.mayPlay;
      break;
    }
    case 'soulstoke': {
      const cands = P.hand.filter(c => isType(c, 'Creature') && isTypeOrSub(def(c), 'Elemental'));
      if (!cands.length) break;
      const yes = ask<boolean>(`${key}:may`, { pid: me, kind: 'may', text: `${srcName}: put an Elemental creature card from your hand onto the battlefield?` });
      if (!yes) break;
      const uid = cands.length === 1 ? cands[0].uid : ask<number[]>(`${key}:c`, { pid: me, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'hand', text: `${srcName}: choose an Elemental.` })[0];
      const c = cands.find(x => x.uid === uid);
      if (!c) break;
      once('s', () => {
        P.hand = P.hand.filter(x => x !== c);
        enter(g, c, me, {});
        (c.kw ??= []).push('haste');
        addDelayed(g, ctx, { at: 'endStep', label: `sacrifice ${nm(c)}`, effects: [{ op: 'sacUid', who: `uid:${c.uid}` }] });
        log(g, `${P.name} puts ${nm(c)} onto the battlefield with haste.`);
      });
      break;
    }
    case 'risenReef': {
      if (!P.library.length) break;
      const c = P.library[P.library.length - 1];
      const land = isType(c, 'Land');
      const put = land && ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: put ${nm(c)} onto the battlefield tapped?` });
      once('r', () => {
        P.library.pop();
        if (put) enter(g, c, me, { tapped: true });
        else P.hand.push(c);
        log(g, `${P.name} ${put ? `puts ${nm(c)} onto the battlefield tapped` : `puts ${nm(c)} into their hand`}.`);
      });
      break;
    }
    case 'fertileGround': {
      const src = srcOf(g, ctx); const ev = evC(ctx);
      if (!src || !ev || src.attachedTo !== ev.uid) break;
      const pid = ev.owner;
      once('f', () => { g.players[pid].pool.push('ANY'); log(g, `${g.players[pid].name} adds one mana of any color (Fertile Ground).`); });
      break;
    }
    case 'auntieOol': {
      const ev = evC(ctx); if (!ev) break;
      if (ev.owner === me) { draw(g, me, 1); log(g, `${P.name} draws a card (Auntie Ool).`); }
      else { loseLife(g, ev.owner, 1); log(g, `${g.players[ev.owner].name} loses 1 life (Auntie Ool).`); }
      break;
    }
    case 'reaperSteal': {
      const ev = evC(ctx); if (!ev || ev.token) break;
      const l = locate(g, ev.uid); if (!l || l.zone !== 'graveyard') break;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: put ${nm(ev)} onto the battlefield under your control?` });
      if (yes) { moveCard(g, ev, 'battlefield', { ctl: me }); log(g, `${P.name} returns ${nm(ev)} under their control.`); }
      break;
    }
    case 'eventideShadow': {
      const cs = allBf(g).filter(c => totalCtrs(c) > 0);
      if (!cs.length) break;
      const pick = ask<number[]>(key, { pid: me, kind: 'pick', cards: cs, min: 0, max: cs.length, zone: 'battlefield', text: `${srcName}: remove all counters from any number of permanents.` });
      once('e', () => {
        let n = 0;
        for (const u of pick) {
          const c = cs.find(x => x.uid === u); if (!c) continue;
          const k = totalCtrs(c); n += k;
          for (const [kind, v] of Object.entries(c.counters ?? {})) if (v > 0) addCounters(g, c, kind, -v);
        }
        if (n) { draw(g, me, n); loseLife(g, me, n); log(g, `${P.name} removes ${n} counters, draws ${n}, and loses ${n} life.`); }
      });
      break;
    }
    case 'aberrantReturn': {
      const cs = (ctx.item.targets ?? []).map((_, i) => tgt(g, ctx, i)).filter((c): c is Card => !!c);
      once('a', () => {
        for (const c of cs) { c.enterCtr = { kind: '-1/-1', n: 1 }; moveCard(g, c, 'battlefield', { ctl: me }); }
        log(g, `${P.name} returns ${cs.map(nm).join(', ') || 'nothing'} with a -1/-1 counter.`);
      });
      break;
    }
    case 'dreadTiller': {
      const cands = [...P.hand, ...P.graveyard].filter(c => isType(c, 'Land'));
      if (!cands.length) break;
      const yes = ask<boolean>(`${key}:may`, { pid: me, kind: 'may', text: `${srcName}: put a land card from your hand or graveyard onto the battlefield tapped?` });
      if (!yes) break;
      const uid = cands.length === 1 ? cands[0].uid : ask<number[]>(`${key}:c`, { pid: me, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'hand', text: `${srcName}: choose a land.` })[0];
      const c = cands.find(x => x.uid === uid);
      if (c) { once('d', () => { if (P.hand.includes(c)) P.hand = P.hand.filter(x => x !== c); else P.graveyard = P.graveyard.filter(x => x !== c); enter(g, c, me, { tapped: true }); log(g, `${P.name} puts ${nm(c)} onto the battlefield tapped.`); }); }
      break;
    }
    case 'oftNabbed': {
      const src = srcOf(g, ctx); if (!src) break;
      once('o', () => {
        draw(g, me, 1);
        changeControl(g, src, me);
        addCounters(g, src, '-1/-1', 1, me);
        log(g, `${P.name} draws a card, gains control of ${nm(src)}, and puts a -1/-1 counter on it.`);
      });
      break;
    }
    case 'oftNabbedDies': {
      const ev = evC(ctx); if (!ev) break;
      const n = ev.lastCtrs?.['-1/-1'] ?? 0;
      if (n <= 0) break;
      once('d', () => {
        draw(g, ev.owner, n);
        for (const q of g.players) if (q.id !== ev.owner) loseLife(g, q.id, n);
        log(g, `${g.players[ev.owner].name} draws ${n}; each other player loses ${n} life.`);
      });
      break;
    }
    case 'pucaCovenant': {
      const ev = evC(ctx); if (!ev) break;
      const n = totalCtrs(ev);
      const cands = P.graveyard.filter(c => isPermanentCard(def(c)) && c.uid !== ev.uid && cmc(def(c)) <= n);
      if (!cands.length) break;
      const yes = ask<boolean>(`${key}:may`, { pid: me, kind: 'may', text: `${srcName}: return a permanent card with mana value ≤ ${n} to your hand?` });
      if (!yes) break;
      const uid = cands.length === 1 ? cands[0].uid : ask<number[]>(`${key}:c`, { pid: me, kind: 'pick', cards: cands, min: 1, max: 1, zone: 'graveyard', text: `${srcName}: choose a card.` })[0];
      const c = cands.find(x => x.uid === uid);
      if (c) { moveCard(g, c, 'hand'); log(g, `${P.name} returns ${nm(c)} to their hand.`); }
      break;
    }
    case 'ferrafor': {
      const pid = tgtPl(ctx); if (pid === undefined) break;
      const n = g.players[pid].battlefield.filter(c => isType(c, 'Creature')).reduce((s, c) => s + totalCtrs(c), 0);
      if (n <= 0) break;
      once('f', () => {
        for (let i = 0; i < n; i++) createToken(g, me, { name: 'Saproling', p: 1, t: 1, colors: ['G'], types: ['Creature'], sub: ['Saproling'] });
        log(g, `${P.name} creates ${n} Saproling token${n > 1 ? 's' : ''}.`);
      });
      break;
    }
    case 'treePerdition': {
      const pid = tgtPl(ctx); const src = srcOf(g, ctx);
      if (pid === undefined || !src) break;
      const q = g.players[pid];
      const t = toughness(g, src);
      const life = q.life;
      once('t', () => {
        if (t < q.life) q.lostLife += q.life - t;
        q.life = t;
        src.anim = { p: power(g, src), t: life, perm: true, ts: (src.ts ?? 0) + 1 };
        layer(g);
        log(g, `${q.name}'s life total becomes ${t}. ${nm(src)}'s toughness becomes ${life}.`);
      });
      break;
    }
    case 'massacreDraw': {
      const ev = evC(ctx); if (!ev) break;
      if ((ev.lki?.t ?? 99) < 1) { draw(g, me, 1); log(g, `${P.name} draws a card (Massacre Girl).`); }
      break;
    }
    case 'scorpionReturn': {
      const ev = evC(ctx); if (!ev || ev.token) break;
      const uid = ev.uid;
      addDelayed(g, ctx, { at: 'endStep', label: `return ${nm(ev)} to its owner's hand`, effects: [{ op: 'script', kind: 'scorpionRetNow', n: uid }] });
      break;
    }
    case 'scorpionRetNow': {
      const uid = e.n as number;
      const l = locate(g, uid);
      if (l && (l.zone === 'graveyard' || l.zone === 'exile')) { moveCard(g, l.c, 'hand'); log(g, `${nm(l.c)} returns to its owner's hand.`); }
      break;
    }
    case 'puppeteer': {
      const c = tgt(g, ctx);
      if (!c || locate(g, c.uid)?.zone !== 'graveyard') break;
      once('p', () => {
        moveCard(g, c, 'battlefield', { ctl: me });
        (c.kw ??= []).push('haste');
        addDelayed(g, ctx, { at: 'endStep', pid: me, label: `exile ${nm(c)}`, effects: [{ op: 'script', kind: 'exileUid', n: c.uid }] });
        log(g, `${P.name} returns ${nm(c)} with haste.`);
      });
      break;
    }
    case 'exileUid': {
      const uid = e.n as number;
      const c = findCard(g, uid);
      if (c) { exileCard(g, c); log(g, `${nm(c)} is exiled.`); }
      break;
    }
    case 'duskUrchins': {
      const ev = evC(ctx); if (!ev) break;
      const n = ev.lastCtrs?.['-1/-1'] ?? 0;
      if (n > 0) { draw(g, me, n); log(g, `${P.name} draws ${n} (Dusk Urchins).`); }
      break;
    }
    case 'shuffleSelf': {
      const c = ctx.item.card;
      if (!c) break;
      ctx.item.awayTo = 'bottom';
      once('s', () => {
        // After the spell leaves, move it into the library and shuffle.
        const l = locate(g, c.uid);
        if (l) {
          const arr = l.p[l.zone === 'graveyard' ? 'graveyard' : l.zone === 'exile' ? 'exile' : l.zone === 'hand' ? 'hand' : 'graveyard'] as Card[] | undefined;
          if (arr && Array.isArray(arr)) {
            // Use move to library then shuffle
          }
        }
        const owner = g.players[c.owner];
        for (const z of ['graveyard', 'exile', 'hand', 'battlefield'] as const) {
          if ((owner as any)[z]?.includes?.(c)) (owner as any)[z] = (owner as any)[z].filter((x: Card) => x !== c);
        }
        owner.library.push(c);
        shuffle(g, owner.library);
        log(g, `${nm(c)} is shuffled into ${owner.name}'s library.`);
      });
      break;
    }
    case 'persistSpell': {
      const c = tgt(g, ctx);
      if (!c || def(c).legendary || locate(g, c.uid)?.zone !== 'graveyard') break;
      once('p', () => { c.enterCtr = { kind: '-1/-1', n: 1 }; moveCard(g, c, 'battlefield', { ctl: me }); log(g, `${P.name} returns ${nm(c)} with a -1/-1 counter.`); });
      break;
    }
    case 'hapatraSnake': {
      if (ctx.item.event?.by !== me) break;
      once('h', () => { createToken(g, me, { name: 'Snake', p: 1, t: 1, colors: ['G'], types: ['Creature'], sub: ['Snake'], kws: ['deathtouch'] }); log(g, `${P.name} creates a Snake token.`); });
      break;
    }
    case 'glissaRemC': {
      const c = tgt(g, ctx); if (!c) break;
      const kinds = Object.entries(c.counters ?? {}).filter(([, n]) => n > 0);
      let left = 3;
      once('g', () => {
        for (const [kind, n] of kinds) {
          if (left <= 0) break;
          const k = Math.min(n, left);
          addCounters(g, c, kind, -k);
          left -= k;
        }
        log(g, `${P.name} removes counters from ${nm(c)}.`);
      });
      break;
    }
    case 'burningCuriosity': {
      const n = ctx.item.blightPaid || ctx.item.kicked ? 3 : 2;
      once('b', () => {
        const cs = popTop(P, n);
        for (const c of cs) { P.exile.push(c); c.mayPlay = g.turn + (g.players.filter(q => !q.lost).length); }
        log(g, `${P.name} exiles ${cs.map(nm).join(', ') || 'nothing'} and may play ${cs.length === 1 ? 'it' : 'them'} until the end of their next turn.`);
      });
      break;
    }
    case 'hoardersGreed': {
      const rec = (tag: string) => {
        loseLife(g, me, 2);
        draw(g, me, 2);
        const opp = opponents(g, me)[0];
        if (!opp || !P.library.length || !opp.library.length) return;
        const a = P.library[P.library.length - 1];
        const b = opp.library[opp.library.length - 1];
        log(g, `Clash: ${P.name} reveals ${nm(a)} (${cmc(def(a))}), ${opp.name} reveals ${nm(b)} (${cmc(def(b))}).`);
        const win = cmc(def(a)) > cmc(def(b));
        const botA = ask<boolean>(`${key}:${tag}a`, { pid: me, kind: 'may', text: `Clash: put ${nm(a)} on the bottom of your library?` });
        if (botA) { P.library.pop(); P.library.unshift(a); }
        const botB = !opp.human || ask<boolean>(`${key}:${tag}b`, { pid: opp.id, kind: 'may', text: `Clash: put ${nm(b)} on the bottom of your library?` });
        // AI opponent: put on bottom if they lost (optional, default yes if lost)
        if (botB || (!opp.human && !win)) {
          if (opp.library[opp.library.length - 1] === b) { opp.library.pop(); opp.library.unshift(b); }
        }
        if (win) rec(tag + 'x');
      };
      rec('c');
      break;
    }
    default:
      return false;
  }
  return true;
}
