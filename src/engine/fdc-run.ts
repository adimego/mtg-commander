/** Runtime for FDC leftover scripts. Replay-safe via api.once / api.ask. */
import type { Card, Game } from './engine';
import {
  addCounters, addDelayed, canCast, CARDS, cmc, createToken, ctr, ctl, def, dealDamage, destroy,
  discardCard, draw, enter, exileCard, findCard, hasKw, isType, isTypeOrSub, locate, log, moveCard,
  opponents, pay, power, sacrifice, shuffle, toughness,
} from './engine';
import type { FrcApi } from './frc';
import type { TokenSpec } from './types';

const nm = (c: { id: string }) => def(c).name;
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
const ZOMBIE: TokenSpec = { name: 'Zombie', p: 2, t: 2, colors: ['B'], types: ['Creature'], sub: ['Zombie'] };
const SPIDER: TokenSpec = { name: 'Spider', p: 1, t: 2, colors: ['G'], types: ['Creature'], sub: ['Spider'], kws: ['reach'] };
const BEAST: TokenSpec = { name: 'Phyrexian Beast', p: 4, t: 4, colors: ['G'], types: ['Creature'], sub: ['Phyrexian', 'Beast'] };
const TREASURE: TokenSpec = { name: 'Treasure', colors: [], types: ['Artifact'], preset: 'Treasure' };

function maxLife(g: Game): number { return Math.max(...g.players.filter(p => !p.lost).map(p => p.life)); }
function coloredPerm(c: Card): boolean { return def(c).colors.length > 0; }

export function runFdcLeftovers(kind: string, api: FrcApi): boolean {
  const { g, ctx, e, key, me, P, srcName, once, ask } = api;
  switch (kind) {
    case 'allIsDust': {
      once('x', () => {
        for (const q of g.players) for (const c of [...q.battlefield]) if (coloredPerm(c)) sacrifice(g, c);
        log(g, `${srcName}: each player sacrifices their colored permanents.`);
      });
      break;
    }
    case 'arachnogenesis': {
      once('x', () => {
        const n = allBf(g).filter(c => c.attacking === me && isType(c, 'Creature')).length;
        for (let i = 0; i < n; i++) ctx.created.push(createToken(g, me, SPIDER));
        (g as Game & { noNonSpiderDmg?: number }).noNonSpiderDmg = g.turn;
        log(g, `${srcName} creates ${n} Spider token${n === 1 ? '' : 's'} and prevents non-Spider combat damage this turn.`);
      });
      break;
    }
    case 'chandrasIgnition': {
      const c = tgt(g, ctx);
      if (!c) break;
      once('x', () => {
        const n = power(g, c);
        for (const x of allBf(g)) if (x !== c && isType(x, 'Creature')) dealDamage(g, c.id, c, { card: x }, n);
        for (const o of opponents(g, ctl(c))) dealDamage(g, c.id, c, { player: o.id }, n);
      });
      break;
    }
    case 'clifftop': {
      once('x', () => {
        const taken: Card[] = [];
        let land: Card | undefined;
        while (P.library.length) {
          const c = P.library.pop()!;
          if (isType(c, 'Land')) { land = c; break; }
          taken.push(c);
        }
        if (land) { enter(g, land, me, { tapped: true }); log(g, `${srcName} puts ${nm(land)} onto the battlefield tapped.`); }
        if (taken.length) { shuffle(g, taken); P.library.unshift(...taken); log(g, `${taken.length} card${taken.length === 1 ? '' : 's'} go on the bottom.`); }
      });
      break;
    }
    case 'consumedGreed': {
      const opp = tgtPl(ctx, 0) ?? opponents(g, me)[0]?.id;
      if (opp === undefined) break;
      once('x', () => {
        const cs = g.players[opp].battlefield.filter(c => isType(c, 'Creature'));
        if (cs.length) {
          const mx = Math.max(...cs.map(c => power(g, c)));
          const opts = cs.filter(c => power(g, c) === mx);
          const pick = opts.length === 1 ? opts[0] : opts.find(c => c.uid === (ask<number[]>(key + ':s', { pid: me, kind: 'pick', cards: opts, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: ${g.players[opp].name} sacrifices a greatest-power creature.` })[0] ?? -1)) ?? opts[0];
          if (pick) sacrifice(g, pick);
        }
        const src = ctx.item.card;
        if (src?.giftPromised) {
          const gy = tgt(g, ctx, 1);
          if (gy) { moveCard(g, gy, 'hand'); log(g, `${P.name} returns ${nm(gy)} to their hand (gift was promised).`); }
        }
      });
      break;
    }
    case 'dragonhawk': {
      const src = srcOf(g, ctx);
      if (!src) break;
      once('x', () => {
        const n = P.battlefield.filter(c => isType(c, 'Creature') && power(g, c) >= 4).length;
        const taken = popTop(P, n);
        for (const c of taken) { P.exile.push(c); c.exBy = src.uid; c.mayPlay = g.turn; c.playFree = true; }
        if (taken.length) log(g, `${srcName} exiles ${taken.map(nm).join(', ')}; ${P.name} may play them until their next end step.`);
        addDelayed(g, ctx, { at: 'endStep', pid: me, label: `${srcName} leftover damage`, effects: [{ op: 'script', kind: 'dragonhawkEnd', n: src.uid } as never] });
      });
      break;
    }
    case 'dragonhawkEnd': {
      const srcUid = e.n as number;
      once('x', () => {
        const left = P.exile.filter(c => c.exBy === srcUid);
        const n = left.length;
        for (const c of left) { delete c.mayPlay; delete c.playFree; }
        if (!n) return;
        const src = findCard(g, srcUid) ?? { id: ctx.item.sourceId } as Card;
        for (const o of opponents(g, me)) dealDamage(g, ctx.item.sourceId, findCard(g, srcUid), { player: o.id }, 2 * n);
        log(g, `${srcName} deals ${2 * n} damage to each opponent for ${n} unplayed card${n === 1 ? '' : 's'}.`);
        void src;
      });
      break;
    }
    case 'emeria': {
      const land = ctx.item.evCard;
      const card = tgt(g, ctx);
      if (!card) break;
      const plains = land && isTypeOrSub(def(land), 'Plains');
      const dest = plains && ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: put ${nm(card)} onto the battlefield instead of into your hand?` });
      once('x', () => {
        if (dest) { enter(g, card, me, {}); log(g, `${srcName} returns ${nm(card)} to the battlefield.`); }
        else { moveCard(g, card, 'hand'); log(g, `${srcName} returns ${nm(card)} to ${P.name}'s hand.`); }
      });
      break;
    }
    case 'atlasDraw': {
      const names = new Map<string, number>();
      for (const c of P.battlefield.filter(x => isType(x, 'Land'))) names.set(def(c).name, (names.get(def(c).name) ?? 0) + 1);
      if (![...names.values()].some(n => n >= 3)) { log(g, `${srcName}: you don't control three lands with the same name.`); break; }
      once('x', () => { draw(g, me, 1); });
      break;
    }
    case 'endlessRanks': {
      once('x', () => {
        const z = P.battlefield.filter(c => isTypeOrSub(def(c), 'Zombie')).length;
        const n = Math.floor(z / 2);
        for (let i = 0; i < n; i++) ctx.created.push(createToken(g, me, ZOMBIE));
        if (n) log(g, `${srcName} creates ${n} Zombie token${n === 1 ? '' : 's'}.`);
      });
      break;
    }
    case 'ezuriPred': {
      once('x', () => {
        const foes = opponents(g, me).flatMap(o => o.battlefield.filter(c => isType(c, 'Creature')));
        const made: Card[] = [];
        for (const _ of foes) made.push(createToken(g, me, BEAST));
        for (let i = 0; i < Math.min(made.length, foes.length); i++) {
          // fight: each token fights a different creature
          dealDamage(g, made[i].id, made[i], { card: foes[i] }, power(g, made[i]));
          dealDamage(g, foes[i].id, foes[i], { card: made[i] }, power(g, foes[i]));
        }
        if (foes.length) log(g, `${srcName} creates ${foes.length} Phyrexian Beast${foes.length === 1 ? '' : 's'} and they fight.`);
      });
      break;
    }
    case 'fatefulInv': {
      const c = tgt(g, ctx);
      const pid = c ? ctl(c) : undefined;
      if (pid === undefined) break;
      once('x', () => {
        createToken(g, pid, { name: 'Clue', colors: [], types: ['Artifact'], preset: 'Clue' });
        log(g, `${g.players[pid].name} investigates.`);
      });
      break;
    }
    case 'firespitter': {
      const ev = ctx.item.evCard;
      if (!ev) break;
      const d = def(ev);
      if (d.types.includes('Creature') && !isTypeOrSub(d, 'Dragon')) break;
      once('x', () => { for (const o of opponents(g, me)) dealDamage(g, ctx.item.sourceId, srcOf(g, ctx), { player: o.id }, 1); });
      break;
    }
    case 'rings': {
      once('x', () => {
        const srcUid = ctx.item.sourceUid;
        for (const t of ctx.item.targets ?? []) {
          const c = t?.card !== undefined ? findCard(g, t.card) : undefined;
          if (!c) continue;
          exileCard(g, c);
          if (locate(g, c.uid)?.zone === 'exile') {
            (g.oRing ??= []).push({ uid: c.uid, src: srcUid });
            log(g, `${nm(c)} is exiled until its captor leaves the battlefield.`);
          }
        }
      });
      break;
    }
    case 'havenRet': {
      const c = tgt(g, ctx);
      if (!c) break;
      const ok = isTypeOrSub(def(c), 'Dragon') || /ugin/i.test(def(c).name);
      if (!ok) break;
      once('x', () => { moveCard(g, c, 'hand'); log(g, `${srcName} returns ${nm(c)} to ${P.name}'s hand.`); });
      break;
    }
    case 'motherLode': {
      once('x', () => {
        const hit = ctx.chosen[0];
        const mv = hit ? cmc(def(hit)) : 10;
        const n = Math.max(0, 10 - mv);
        for (let i = 0; i < n; i++) createToken(g, me, TREASURE, { tapped: true });
        if (n) log(g, `${srcName} creates ${n} tapped Treasure token${n === 1 ? '' : 's'}.`);
      });
      break;
    }
    case 'leylineDie': {
      const t = ctx.item.targets?.[0];
      once('x', () => {
        let n = 0;
        while (pay(g, P, { generic: 0, R: 1 })) n++;
        if (!n) return;
        if (t?.card !== undefined) { const c = findCard(g, t.card); if (c) dealDamage(g, ctx.item.sourceId, undefined, { card: c }, n); }
        else if (t?.player !== undefined) dealDamage(g, ctx.item.sourceId, undefined, { player: t.player }, n);
        log(g, `${srcName} pays {R}×${n} and deals ${n} damage.`);
      });
      break;
    }
    case 'linvalaLife': {
      if (!opponents(g, me).some(o => o.life > P.life)) break;
      once('x', () => { P.life += 5; P.gained += 5; log(g, `${P.name} gains 5 life (${srcName}).`); });
      break;
    }
    case 'lootExplore': {
      once('x', () => {
        const top = popTop(P, 6);
        const lands = P.battlefield.filter(c => isType(c, 'Land')).length;
        const opts = top.filter(c => isType(c, 'Creature') && cmc(def(c)) <= lands);
        let hit: Card | undefined;
        if (opts.length && ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: put a creature with mana value ≤ ${lands} onto the battlefield?` })) {
          const a = opts.length === 1 ? [opts[0].uid] : ask<number[]>(key + ':c', { pid: me, kind: 'pick', cards: opts, min: 1, max: 1, zone: 'library', text: `${srcName}: choose a creature.` });
          hit = opts.find(c => c.uid === a[0]);
        }
        if (hit) { enter(g, hit, me, {}); log(g, `${srcName} puts ${nm(hit)} onto the battlefield.`); }
        const rest = top.filter(c => c !== hit);
        shuffle(g, rest);
        P.library.unshift(...rest);
      });
      break;
    }
    case 'transmuter': {
      const bounce = tgt(g, ctx);
      if (bounce) once('b', () => { moveCard(g, bounce, 'hand'); log(g, `${P.name} returns ${nm(bounce)} to their hand.`); });
      const arts = P.hand.filter(c => isType(c, 'Artifact'));
      if (!arts.length) break;
      if (!ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: put an artifact card from your hand onto the battlefield?` })) break;
      const a = arts.length === 1 ? [arts[0].uid] : ask<number[]>(key + ':a', { pid: me, kind: 'pick', cards: arts, min: 1, max: 1, zone: 'hand', text: `${srcName}: choose an artifact card.` });
      const hit = arts.find(c => c.uid === a[0]);
      if (hit) once('e', () => { enter(g, hit, me, {}); log(g, `${srcName} puts ${nm(hit)} onto the battlefield.`); });
      break;
    }
    case 'mazeTome': {
      const s = srcOf(g, ctx);
      if (!s || ctr(s, 'page') < 4) break;
      once('x', () => { exileCard(g, s); P.life += 4; P.gained += 4; log(g, `${nm(s)} is exiled; ${P.name} gains 4 life.`); });
      break;
    }
    case 'metroLife': {
      const n = ctx.item.event?.amount ?? 0;
      if (n > 0) once('x', () => { P.life += n; P.gained += n; log(g, `${P.name} gains ${n} life (${srcName}).`); });
      break;
    }
    case 'packTactics': {
      const dragons = P.hand.filter(c => isType(c, 'Creature') && isTypeOrSub(def(c), 'Dragon'));
      if (!dragons.length) break;
      if (!ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: put a Dragon card from your hand onto the battlefield tapped and attacking?` })) break;
      const a = dragons.length === 1 ? [dragons[0].uid] : ask<number[]>(key + ':d', { pid: me, kind: 'pick', cards: dragons, min: 1, max: 1, zone: 'hand', text: `${srcName}: choose a Dragon.` });
      const hit = dragons.find(c => c.uid === a[0]);
      const src = srcOf(g, ctx);
      if (hit && src) once('x', () => {
        enter(g, hit, me, { tapped: true });
        hit.attacking = src.attacking;
        hit.atkT = g.turn;
        hit.blockedBy = [];
        log(g, `${srcName} puts ${nm(hit)} onto the battlefield tapped and attacking.`);
      });
      break;
    }
    case 'signpost': {
      const atk = tgt(g, ctx) ?? allBf(g).filter(c => c.attacking !== undefined)[0];
      if (!atk || atk.attacking === undefined) break;
      if (!ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: reselect who ${nm(atk)} is attacking?` })) break;
      const opps = opponents(g, ctl(atk)).map(p => p.id);
      const pws = opponents(g, ctl(atk)).flatMap(p => p.battlefield.filter(c => isType(c, 'Planeswalker')));
      const options = [...opps.map(id => `Player:${id}`), ...pws.map(c => `PW:${c.uid}`)];
      if (!options.length) break;
      const pick = ask<string>(key + ':t', { pid: me, kind: 'color', options, text: `${srcName}: choose a new attack target.` });
      once('x', () => {
        if (pick.startsWith('Player:')) atk.attacking = +pick.slice(7);
        else if (pick.startsWith('PW:')) {
          const pw = findCard(g, +pick.slice(3));
          if (pw) atk.attacking = ctl(pw); // best-effort: attack that player (planeswalker attack not always modeled)
        }
        log(g, `${srcName} reselects ${nm(atk)}'s attack.`);
      });
      break;
    }
    case 'monstrousOnslaught': {
      once('x', () => {
        const x = Math.max(0, ...P.battlefield.filter(c => isType(c, 'Creature')).map(c => power(g, c)));
        const tgts = (ctx.item.targets ?? []).map(t => t?.card !== undefined ? findCard(g, t.card) : undefined).filter((c): c is Card => !!c);
        if (!tgts.length || !x) {
          // no pre-chosen targets: deal all to one creature if any, else no-op
          return;
        }
        let left = x;
        for (let i = 0; i < tgts.length; i++) {
          const share = i === tgts.length - 1 ? left : Math.floor(left / (tgts.length - i));
          if (share > 0) dealDamage(g, ctx.item.sourceId, undefined, { card: tgts[i] }, share);
          left -= share;
        }
        log(g, `${srcName} deals ${x} damage divided among ${tgts.length} creature${tgts.length === 1 ? '' : 's'}.`);
      });
      break;
    }
    case 'myrSphere': {
      const src = srcOf(g, ctx);
      if (!src) break;
      const myr = P.battlefield.filter(c => c !== src && !c.tapped && isTypeOrSub(def(c), 'Myr'));
      if (!myr.length) break;
      if (!ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: tap any number of untapped Myr you control?` })) break;
      const a = ask<number[]>(key + ':m', { pid: me, kind: 'pick', cards: myr, min: 0, max: myr.length, zone: 'battlefield', text: `${srcName}: tap Myr.` });
      const picked = myr.filter(c => a.includes(c.uid));
      once('x', () => {
        for (const c of picked) c.tapped = true;
        const x = picked.length;
        if (!x) return;
        src.pp = (src.pp ?? 0) + x;
        const defn = src.attacking;
        if (defn !== undefined) dealDamage(g, src.id, src, { player: defn }, x);
        log(g, `${srcName} taps ${x} Myr, gets +${x}/+0, and deals ${x} damage.`);
      });
      break;
    }
    case 'nogiAtk': {
      const src = srcOf(g, ctx);
      if (!src || P.battlefield.filter(c => isTypeOrSub(def(c), 'Dragon')).length < 3) break;
      once('x', () => {
        src.addSub = [...(src.addSub ?? []), 'Dragon']; src.pp = 5 - (def(src).power ?? 0); src.pt = 5 - (def(src).toughness ?? 0); src.kw = [...(src.kw ?? []), 'flying'];
        log(g, `${nm(src)} becomes a 5/5 Dragon with flying until end of turn.`);
      });
      break;
    }
    case 'orbDragonMana': {
      once('x', () => {
        const a = ask<string>(key + ':a', { pid: me, kind: 'color', options: ['W', 'U', 'B', 'R', 'G'], text: `${srcName}: first mana.` });
        const b = ask<string>(key + ':b', { pid: me, kind: 'color', options: ['W', 'U', 'B', 'R', 'G'], text: `${srcName}: second mana.` });
        const ca = (a && a.length === 1) ? a : 'R';
        const cb = (b && b.length === 1) ? b : 'R';
        P.pool.push(ca + '@dragon', cb + '@dragon');
        g.lastMana = [ca, cb];
        log(g, `${srcName} adds {${ca}}{${cb}} (Dragon only).`);
      });
      break;
    }
    case 'outpostChoose': {
      const pick = ask<string>(key, { pid: me, kind: 'color', options: ['Khans', 'Dragons'], text: `${srcName}: choose Khans or Dragons.` });
      const src = ctx.item.card;
      once('x', () => {
        if (!src) return;
        src.chosenType = pick.startsWith('D') ? 'Dragons' : 'Khans';
        log(g, `${P.name} chooses ${src.chosenType} for ${nm(src)}.`);
      });
      break;
    }
    case 'padeemDraw': {
      const arts = allBf(g).filter(c => isType(c, 'Artifact'));
      if (!arts.length) break;
      const mx = Math.max(...arts.map(c => cmc(def(c))));
      if (!P.battlefield.some(c => isType(c, 'Artifact') && cmc(def(c)) === mx)) break;
      once('x', () => { draw(g, me, 1); });
      break;
    }
    case 'parapet': {
      const src = srcOf(g, ctx);
      if (!src) break;
      const used = src.parapetUsed ?? [];
      if (used.length >= 3 && used[0] === g.turn) { /* all chosen this turn */ break; }
      if (used[0] !== g.turn) src.parapetUsed = [g.turn];
      const done = (src.parapetUsed ?? []).slice(1);
      const options = ['Destroy an artifact', '4 damage to each other opponent', 'Exile the top card, you may play it'].filter((_, i) => !done.includes(i));
      if (!options.length) break;
      const pick = ask<string>(key, { pid: me, kind: 'color', options, text: `${srcName}: choose a mode that hasn't been chosen this turn.` });
      const idx = options.indexOf(pick);
      const real = ['Destroy an artifact', '4 damage to each other opponent', 'Exile the top card, you may play it'].indexOf(pick);
      once('x', () => {
        (src.parapetUsed ??= [g.turn]).push(real);
        const vs = ctx.item.event?.vs ?? ctx.item.event?.player;
        if (real === 0 && vs !== undefined) {
          const arts = g.players[vs].battlefield.filter(c => isType(c, 'Artifact'));
          if (arts.length) {
            const a = arts.length === 1 ? [arts[0].uid] : ask<number[]>(key + ':a', { pid: me, kind: 'pick', cards: arts, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: destroy an artifact that opponent controls.` });
            const c = arts.find(x => x.uid === a[0]);
            if (c) { destroy(g, c); }
          }
        } else if (real === 1 && vs !== undefined) {
          for (const o of opponents(g, me)) if (o.id !== vs) dealDamage(g, src.id, src, { player: o.id }, 4);
        } else if (real === 2) {
          const c = P.library.pop();
          if (c) { P.exile.push(c); c.mayPlay = g.turn; log(g, `${srcName} exiles ${nm(c)}; ${P.name} may play it this turn.`); }
        }
        void idx;
      });
      break;
    }
    case 'hammerStun': {
      const src = srcOf(g, ctx);
      if (!src) break;
      const other = P.battlefield.some(c => c !== src && isTypeOrSub(def(c), 'Dinosaur'));
      if (other) break;
      once('x', () => { addCounters(g, src, 'stun', 1); log(g, `${nm(src)} gets a stun counter.`); });
      break;
    }
    case 'ramThrough': {
      const a = tgt(g, ctx, 0); const b = tgt(g, ctx, 1);
      if (!a || !b) break;
      once('x', () => {
        const n = power(g, a);
        const lethal = Math.max(0, toughness(g, b) - b.damage);
        dealDamage(g, a.id, a, { card: b }, n);
        if (hasKw(a, 'trample') && n > lethal) dealDamage(g, a.id, a, { player: ctl(b) }, n - lethal);
      });
      break;
    }
    case 'razorlash': {
      const src = locate(g, ctx.item.sourceUid)?.c;
      if (!src || !P.graveyard.includes(src)) break;
      once('x', () => {
        enter(g, src, me, {});
        addCounters(g, src, '+1/+1', 1);
        log(g, `${nm(src)} returns to the battlefield with a +1/+1 counter.`);
      });
      break;
    }
    case 'rishkarExp': {
      const opts = P.hand.filter(c => cmc(def(c)) <= 5 && !isType(c, 'Land') && canCast(g, me, c, { omni: true } as never));
      if (!opts.length) break;
      if (!ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: cast a spell with mana value 5 or less from your hand without paying its mana cost?` })) break;
      const a = opts.length === 1 ? [opts[0].uid] : ask<number[]>(key + ':c', { pid: me, kind: 'pick', cards: opts, min: 1, max: 1, zone: 'hand', text: `${srcName}: choose a spell.` });
      const hit = opts.find(c => c.uid === a[0]);
      if (hit) { g.castNow = { pid: me, uid: hit.uid, free: true }; }
      break;
    }
    case 'sarkhanBehold': {
      const dragons = [
        ...P.battlefield.filter(c => isTypeOrSub(def(c), 'Dragon')),
        ...P.hand.filter(c => isTypeOrSub(def(c), 'Dragon')),
      ];
      if (!dragons.length) break;
      if (!ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: behold a Dragon? If you do, create a Treasure.` })) break;
      const a = dragons.length === 1 ? [dragons[0].uid] : ask<number[]>(key + ':d', { pid: me, kind: 'pick', cards: dragons, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: behold a Dragon (in play or in your hand).` });
      const hit = dragons.find(c => c.uid === a[0]);
      if (hit && P.hand.includes(hit)) log(g, `${P.name} reveals ${nm(hit)}.`);
      once('x', () => { createToken(g, me, TREASURE); log(g, `${srcName}: ${P.name} creates a Treasure token.`); });
      break;
    }
    case 'sarkhanDragon': {
      const src = srcOf(g, ctx);
      const ev = ctx.item.evCard;
      if (!src || ev === src) break;
      once('x', () => {
        addCounters(g, src, '+1/+1', 1);
        src.addSub = [...(src.addSub ?? []), 'Dragon']; src.kw = [...(src.kw ?? []), 'flying'];
        log(g, `${nm(src)} gets a +1/+1 counter and becomes a Dragon with flying until end of turn.`);
      });
      break;
    }
    case 'scourgeXtra': {
      const src = srcOf(g, ctx);
      if (!src || src.attacking === undefined) break;
      if (g.players[src.attacking]?.life !== maxLife(g)) break;
      // first time each turn: skip if already used
      if (src.scourgeT === g.turn) break;
      once('x', () => {
        src.scourgeT = g.turn;
        for (const c of allBf(g)) if (c.attacking !== undefined) c.tapped = false;
        g.extraAfterCombat = (g.extraAfterCombat ?? 0) + 1;
        log(g, `${srcName} untaps all attacking creatures. After this phase, there is an additional combat phase.`);
      });
      break;
    }
    case 'spinerock': {
      const src = srcOf(g, ctx);
      if (!src) break;
      const dealt = opponents(g, me).some(o => o.lostLife >= 7 || (o as { dmgTLife?: number }).dmgTLife === g.turn);
      // fallback: any opponent lost at least 7 life this turn
      const hit7 = opponents(g, me).some(o => (o.lostLife ?? 0) >= 7);
      // also check cmd damage / combat: use lostLife as a stand-in; plus a per-turn damage bucket if present
      const ok = hit7 || opponents(g, me).some(o => (o as { dmgThisTurn?: number }).dmgThisTurn !== undefined && ((o as { dmgThisTurn?: number }).dmgThisTurn ?? 0) >= 7);
      if (!ok && !dealt) { log(g, `${srcName}: no opponent was dealt 7 or more damage this turn.`); break; }
      const ex = g.players.flatMap(q => q.exile.filter(c => c.exBy === src.uid));
      // hideaway cards may be tagged differently; take face-down exiles linked to this
      const cards = g.players.flatMap(q => q.exile.filter(c => c.exBy === src.uid));
      const c = cards[0] ?? ex[0];
      if (!c) break;
      c.mayPlay = g.turn; c.playFree = true;
      log(g, `${srcName}: ${P.name} may play ${nm(c)} without paying its mana cost.`);
      void ok;
      break;
    }
    case 'spitFlame': {
      const card = locate(g, ctx.item.sourceUid)?.c;
      const zone = locate(g, ctx.item.sourceUid);
      if (!card || zone?.zone !== 'graveyard') break;
      if (!ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: pay {R} to return it to your hand?` })) break;
      if (!pay(g, P, { generic: 0, R: 1 })) break;
      once('x', () => { moveCard(g, card, 'hand'); log(g, `${P.name} returns ${nm(card)} to their hand.`); });
      break;
    }
    case 'hellkiteX': {
      const src = srcOf(g, ctx);
      const x = ctx.item.card?.x ?? (e.n as number) ?? 0;
      if (!src) break;
      once('x', () => {
        for (const c of [...allBf(g)]) {
          if (isType(c, 'Land')) continue;
          if (cmc(def(c)) !== x) continue;
          const ctrlr = g.players[ctl(c)];
          if (ctrlr && (src.dmgBy && false)) { /* no */ }
          // "whose controller was dealt combat damage by ~ this turn"
          if (src.hitVs === ctl(c) || (ctrlr && (c as Card))) {
            // hitVs is last combat player; also allow dmgThisTurn flag on player from this source
            const hit = src.hitVs === ctl(c);
            if (hit) { destroy(g, c); }
          }
        }
      });
      break;
    }
    case 'syphonFlesh': {
      once('x', () => {
        let n = 0;
        for (const o of opponents(g, me)) {
          const cs = o.battlefield.filter(c => isType(c, 'Creature'));
          if (!cs.length) continue;
          const pick = cs.sort((a, b) => power(g, a) - power(g, b))[0];
          sacrifice(g, pick);
          n++;
        }
        for (let i = 0; i < n; i++) createToken(g, me, ZOMBIE);
        if (n) log(g, `${srcName}: ${n} creature${n === 1 ? '' : 's'} sacrificed; ${P.name} creates ${n} Zombie${n === 1 ? '' : 's'}.`);
      });
      break;
    }
    case 'edwII': {
      const n = P.hand.length;
      if (!n) break;
      const a = ask<number[]>(key, { pid: me, kind: 'pick', cards: P.hand, min: 0, max: n, zone: 'hand', text: `${srcName}: discard any number of cards, then draw that many.` });
      once('x', () => {
        const sel = P.hand.filter(c => a.includes(c.uid));
        for (const c of sel) { discardCard(g, c); }
        if (sel.length) draw(g, me, sel.length);
      });
      break;
    }
    case 'thickest': {
      const creats = allBf(g).filter(c => isType(c, 'Creature'));
      if (!creats.length) break;
      const mx = Math.max(...creats.map(c => power(g, c)));
      if (!P.battlefield.some(c => isType(c, 'Creature') && power(g, c) === mx)) break;
      once('x', () => { draw(g, me, 2); });
      break;
    }
    case 'thunderbreak': {
      const evp = ctx.item.event?.by ?? ctx.item.event?.player;
      // opponent who targeted
      const who = evp !== undefined && evp !== me ? evp : undefined;
      if (who === undefined) break;
      once('x', () => { dealDamage(g, ctx.item.sourceId, srcOf(g, ctx), { player: who }, 3); });
      break;
    }
    case 'unnatural': {
      once('x', () => {
        for (const c of P.battlefield.filter(x => isType(x, 'Creature'))) {
          const p = power(g, c), t = toughness(g, c);
          c.pp = (c.pp ?? 0) + p;
          c.pt = (c.pt ?? 0) + t;
        }
        log(g, `${srcName} doubles the power and toughness of each creature ${P.name} controls until end of turn.`);
      });
      break;
    }
    case 'vanguardSurveil': {
      if (P.vanguardGainT === g.turn) break;
      once('x', () => {
        P.vanguardGainT = g.turn;
        if (!P.library.length) return;
        const c = P.library.pop()!;
        const mill = ask<boolean>(key + ':s', { pid: me, kind: 'may', text: `${srcName}: put ${nm(c)} into your graveyard? (surveil 1)` });
        if (mill) P.graveyard.push(c); else P.library.push(c);
      });
      break;
    }
    case 'whiptongue': {
      const src = srcOf(g, ctx);
      if (!src) break;
      once('x', () => {
        const flyers = allBf(g).filter(c => hasKw(c, 'flying'));
        let n = 0;
        for (const c of flyers) { if (findCard(g, c.uid) && hasKw(c, 'flying')) { destroy(g, c); if (!findCard(g, c.uid) || locate(g, c.uid)?.zone !== 'battlefield') n++; } }
        if (n) addCounters(g, src, '+1/+1', n);
        log(g, `${srcName} destroys ${n} creature${n === 1 ? '' : 's'} with flying.`);
      });
      break;
    }
    case 'wojek': {
      once('x', () => {
        const n = opponents(g, me).filter(o => o.hand.length > P.hand.length).length;
        for (let i = 0; i < n; i++) createToken(g, me, { name: 'Clue', colors: [], types: ['Artifact'], preset: 'Clue' });
        if (n) log(g, `${srcName}: ${P.name} investigates ${n} time${n === 1 ? '' : 's'}.`);
      });
      break;
    }
    case 'zulCast': {
      const c = tgt(g, ctx);
      if (!c) break;
      once('x', () => { c.mayPlay = g.turn; log(g, `${P.name} may cast ${nm(c)} from their graveyard this turn.`); });
      break;
    }
    case 'surrakForm': {
      const sum = P.battlefield.filter(c => isType(c, 'Creature')).reduce((s, c) => s + power(g, c), 0);
      if (sum < 8) break;
      const c = tgt(g, ctx);
      if (!c) break;
      once('x', () => { c.kw = [...(c.kw ?? []), 'haste']; log(g, `${nm(c)} gains haste until end of turn.`); });
      break;
    }
    case 'sleuthInv': {
      const ev = ctx.item.evCard;
      const had = ev && ev.lastCtrs && Object.values(ev.lastCtrs).some(n => n > 0);
      if (!had) break;
      once('x', () => { createToken(g, me, { name: 'Clue', colors: [], types: ['Artifact'], preset: 'Clue' }); log(g, `${srcName}: ${P.name} investigates.`); });
      break;
    }
    case 'outpostKhans': {
      const src = srcOf(g, ctx);
      if (!src || src.chosenType !== 'Khans') break;
      once('x', () => {
        const c = P.library.pop();
        if (!c) return;
        P.exile.push(c); c.mayPlay = g.turn; c.exBy = src.uid;
        log(g, `${srcName} (Khans) exiles ${nm(c)}; ${P.name} may play it this turn.`);
      });
      break;
    }
    case 'outpostDragons': {
      const src = srcOf(g, ctx);
      if (!src || src.chosenType !== 'Dragons') break;
      const t = ctx.item.targets?.[0];
      once('x', () => {
        if (t?.card !== undefined) { const c = findCard(g, t.card); if (c) dealDamage(g, src.id, src, { card: c }, 1); }
        else if (t?.player !== undefined) dealDamage(g, src.id, src, { player: t.player }, 1);
        else {
          const opps = opponents(g, me);
          if (opps.length) dealDamage(g, src.id, src, { player: opps[0].id }, 1);
        }
      });
      break;
    }
        case 'readAheadLore': {
      const c = ctx.item.card ?? srcOf(g, ctx);
      if (!c || !def(c).saga) break;
      const pick = ask<string>(key, { pid: me, kind: 'color', options: ['I', 'II', 'III'], text: `${srcName}: choose a chapter to start at (read ahead).` });
      const n = pick === 'III' ? 3 : pick === 'II' ? 2 : 1;
      once('x', () => {
        if (n > 1) (c.counters ??= {}).lore = n - 1;
        addCounters(g, c, 'lore', 1);
        log(g, `${nm(c)} starts at chapter ${['I', 'II', 'III'][n - 1]} (read ahead).`);
      });
      break;
    }
    default:
      return false;
  }
  return true;
}
