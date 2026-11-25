/** Exact resolution for Star Trek Commander cards the generic compiler can't express. Replay-safe: library moves happen once. */
import type { Card, CardDef, Color, Effect, Game, Player, ResCtx, TokenSpec } from './engine';
import {
  addCounters, becomeCopy, canCast, CARDS, castNowStep, cmc, createToken, def, draw, enter,
  exileCard, findCard, isPermanentCard, isType, isTypeOrSub, locate, log, loseLife, moveCard,
  opponents, phaseOut, power, shuffle, dealDamage,
} from './engine';
import type { FrcApi } from './frc';

const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];
const asColor = (v: unknown): Color => COLORS.includes(v as Color) ? v as Color : 'U';
const BORG: TokenSpec = { name: 'Borg', p: 1, t: 1, colors: [], types: ['Artifact', 'Creature'], sub: ['Borg'] };
const KLINGON: TokenSpec = { name: 'Klingon Warrior', p: 2, t: 1, colors: ['R'], types: ['Creature'], sub: ['Klingon', 'Warrior'], kws: ['haste'] };
const TRIBBLE: TokenSpec = { name: 'Tribble', p: 1, t: 1, colors: ['W'], types: ['Creature'], sub: ['Tribble'] };
const uniqLands = (g: Game, pid: number) => new Set(g.players[pid].battlefield.filter(c => isType(c, 'Land')).map(c => def(c).name)).size;
const nm = (c: { id: string }) => def(c).name;
const srcCard = (g: Game, ctx: ResCtx) => findCard(g, ctx.item.sourceUid);
const tCard = (g: Game, ctx: ResCtx, i = 0) => {
  const t = ctx.item.targets?.[i] ?? (i === 0 ? ctx.item.target : undefined);
  return t?.card !== undefined ? findCard(g, t.card) ?? locate(g, t.card)?.c : undefined;
};
const tPlayer = (g: Game, ctx: ResCtx, i = 0) => {
  const t = ctx.item.targets?.[i] ?? (i === 0 ? ctx.item.target : undefined);
  return t?.player !== undefined ? t.player : undefined;
};
const bottomRandom = (g: Game, p: Player, cs: Card[]) => { shuffle(g, cs); p.library.unshift(...cs); };
const revealUntil = (p: Player, ok: (c: Card) => boolean): { hit?: Card; rest: Card[] } => {
  const rest: Card[] = [];
  while (p.library.length) { const c = p.library.pop()!; if (ok(c)) return { hit: c, rest }; rest.push(c); }
  return { rest };
};
const copyStackSpell = (g: Game, ctx: ResCtx, api: FrcApi, uid: number) => {
  const { me, P, once } = api;
  const orig = g.stack.find(s => s.kind === 'spell' && s.card?.uid === uid);
  if (!orig?.card) return;
  once('copy', () => {
    const card: Card = { ...orig.card!, uid: g.nextUid++, isCopy: true, token: isPermanentCard(def(orig.card!)) ? true : orig.card!.token };
    g.stack.push({ ...orig, id: g.nextUid++, controller: me, card, label: `copy of ${orig.label}` });
    log(g, `${P.name} copies ${nm(orig.card!)}.`);
  });
};

export function runTrek(kind: string | undefined, api: FrcApi): boolean {
  if (!kind) return false;
  const { g, ctx, e, key, me, P, srcName, once, ask } = api;
  const src = srcCard(g, ctx);

  switch (kind) {
    case 'alexander': {
      once('rev', () => {
        const revealed: Card[] = [];
        for (const q of g.players.filter(x => !x.lost)) {
          const c = q.library[q.library.length - 1];
          if (c) { revealed.push(c); log(g, `${q.name} reveals ${nm(c)}.`); }
        }
        ctx.ans[`${key}:mv`] = Math.max(0, ...revealed.map(c => cmc(def(c))));
      });
      for (const q of g.players.filter(x => !x.lost)) draw(g, q.id, 1);
      const dmg = (ctx.ans[`${key}:mv`] as number) ?? 0;
      if (dmg > 0) {
        const opps = opponents(g, me);
        if (opps.length) {
          once('hit', () => {
            const o = opps[Math.floor(Math.abs(g.seed + g.turn + me) % opps.length)];
dealDamage(g, ctx.item.sourceId, src, { player: o.id }, dmg);
            log(g, `${srcName} deals ${dmg} damage to ${o.name}.`);
          });
        }
      }
      return true;
    }
    case 'parley': {
      once('rev', () => {
        let n = 0;
        for (const q of g.players.filter(x => !x.lost)) {
          const c = q.library[q.library.length - 1];
          if (c) { if (!isType(c, 'Land')) n++; log(g, `${q.name} reveals ${nm(c)}.`); }
        }
        ctx.ans[`${key}:n`] = n;
      });
      for (const q of g.players.filter(x => !x.lost)) draw(g, q.id, 1);
      const n = (ctx.ans[`${key}:n`] as number) ?? 0;
      if (n && src) addCounters(g, src, '+1/+1', n);
      return true;
    }
    case 'belanna': {
      if (!P.library.length) { if (src) addCounters(g, src, '+1/+1', 2); return true; }
      const top = P.library[P.library.length - 1];
      const yes = ask<boolean>(key + ':rev', { pid: me, kind: 'may', text: `${srcName}: reveal ${nm(top)}?` });
      if (!yes) { if (src) addCounters(g, src, '+1/+1', 2); return true; }
      once('rev', () => { log(g, `${P.name} reveals ${nm(top)}.`); });
      if (isType(top, 'Artifact')) draw(g, me, 1);
      else if (src) addCounters(g, src, '+1/+1', 2);
      return true;
    }
    case 'borgIncursion': {
      const col = asColor(ask<string>(key, { pid: me, kind: 'color', options: COLORS, text: 'Choose a color. Artifact creatures you control gain protection from that color until end of turn.' }));
      once('g', () => {
        for (const c of P.battlefield) if (isType(c, 'Artifact') && isType(c, 'Creature')) {
          (c.kw ??= []).push(`protection from ${{ W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' }[col]}`);
          (c as Card & { protEot?: number }).protEot = g.turn;
        }
        log(g, `Artifact creatures ${P.name} controls gain protection from ${col} until end of turn.`);
      });
      return true;
    }
    case 'kirk': {
      const ok = (c: Card) => !!def(c).basic || def(c).name === 'Starship Enterprise';
      const gy = P.graveyard.filter(ok);
      const lib = P.library.filter(ok);
      const all = [...gy, ...lib];
      if (!all.length) { once('sh', () => { /* still may have searched library: shuffle if we looked */ }); return true; }
      const a = ask<number[]>(key, { pid: me, kind: 'pick', cards: all, min: 0, max: 1, zone: 'any', text: `${srcName}: you may search your library and/or graveyard for a basic land card or a card named Starship Enterprise.` });
      once('t', () => {
        const c = all.find(x => x.uid === a[0]);
        const fromLib = !!(c && P.library.includes(c));
        if (c) {
          P.library = P.library.filter(x => x !== c);
          P.graveyard = P.graveyard.filter(x => x !== c);
          P.hand.push(c);
          log(g, `${P.name} finds ${nm(c)}.`);
        }
        shuffle(g, P.library);
        if (fromLib || !c) { /* library was searched */ }
        else if (lib.length || true) { /* Oracle: if you search your library this way, shuffle. If only graveyard, no shuffle required — but looking at library to offer cards searches it. */ }
      });
      // Searching "library and/or graveyard" looks at the library, so shuffle always.
      return true;
    }
    case 'scotty': {
      const cands = P.hand.filter(c => isType(c, 'Creature') || isTypeOrSub(def(c), 'Spacecraft'));
      if (!cands.length) return true;
      const a = ask<number[]>(key, { pid: me, kind: 'pick', cards: cands, min: 0, max: 1, zone: 'hand', text: `${srcName}: you may put a creature or Spacecraft card from your hand onto the battlefield.` });
      const c = cands.find(x => x.uid === a[0]);
      if (!c) return true;
      const x = uniqLands(g, me);
      once('p', () => {
        P.hand = P.hand.filter(x => x !== c);
        enter(g, c, me, {});
        if (findCard(g, c.uid)) {
          if (isType(c, 'Creature') && x > 0) addCounters(g, c, '+1/+1', x);
          if (isTypeOrSub(def(c), 'Spacecraft') && x > 0) addCounters(g, c, 'charge', x);
        }
        log(g, `${P.name} puts ${nm(c)} onto the battlefield${x ? ` with ${x} additional counters` : ''}.`);
      });
      return true;
    }
    case 'chronoEscape': {
      once('x', () => {
        const al = g.players.filter(q => !q.lost);
        const until = g.turn + al.length - 1;
        for (const q of al) if (q.id !== me) (q.noAtkVs ??= []).push({ pid: me, t: until });
        const c = ctx.item.card;
        if (c) {
          const loc = locate(g, c.uid);
          if (loc && loc.zone !== 'exile') {
            moveCard(g, c, 'exile', { quiet: true });
          }
          const ex = g.players[c.owner].exile.find(x => x.uid === c.uid) ?? (g.players[me].exile.find(x => x.uid === c.uid));
          if (ex) { ex.suspended = true; (ex.counters ??= {}).time = 3; log(g, `${nm(ex)} is exiled with three time counters.`); }
        }
        log(g, `Until ${P.name}'s next turn, creatures can't attack them.`);
      });
      return true;
    }
    case 'troi': {
      const oppId = tPlayer(g, ctx, 0);
      if (oppId === undefined || g.active !== oppId) return true;
      const o = g.players[oppId];
      const cands = o.hand.filter(c => !isType(c, 'Land') && (canCast(g, oppId, c, { free: true }) || (g.castNow, false) || true));
      // Offer any nonland they could theoretically try; castNowStep checks canCast.
      const spells = o.hand.filter(c => !isType(c, 'Land'));
      if (!spells.length) { draw(g, me, 1); return true; }
      const a = ask<number[]>(key, { pid: oppId, kind: 'pick', cards: spells, min: 0, max: 1, zone: 'hand', text: `${srcName}: you may cast a spell from your hand without paying its mana cost.` });
      const c = spells.find(x => x.uid === a[0]);
      if (!c) { draw(g, me, 1); return true; }
      const cast = castNowStep(g, ctx, key + ':cast', oppId, c, true);
      if (cast) copyStackSpell(g, ctx, api, c.uid);
      else draw(g, me, 1);
      return true;
    }
    case 'cloneSnw': {
      const s = ctx.item.card; if (!s || s.origId) return true;
      const cands = g.players.flatMap(p => p.battlefield.filter(c => c !== s && isType(c, 'Creature')));
      if (!cands.length) return true;
      const a = ask<number[]>(key, { pid: me, kind: 'pick', cards: cands, min: 0, max: 1, zone: 'battlefield', text: `${srcName}: you may have it enter as a copy of any creature on the battlefield.` });
      const t = cands.find(c => c.uid === a[0]); if (!t) return true;
      once('x', () => { becomeCopy(g, s, t, { nonlegendary: true }); s.snwPt = true; log(g, `${nm(s)}'s power and toughness are each equal to the number of differently named lands you control.`); });
      return true;
    }
    case 'spock': {
      const top = P.library[P.library.length - 1]; if (!top) return true;
      once('rev', () => { log(g, `${P.name} reveals ${nm(top)}.`); });
      const x = uniqLands(g, me);
      if (isType(top, 'Land')) {
        const yes = ask<boolean>(key + ':land', { pid: me, kind: 'may', text: `${srcName}: put ${nm(top)} onto the battlefield tapped?` });
        if (yes) {
          once('l', () => { P.library.pop(); enter(g, top, me, { tapped: true }); });
          return true;
        }
      } else if (cmc(def(top)) <= x) {
        const cast = castNowStep(g, ctx, key + ':cast', me, top, true);
        if (cast) return true;
      }
      if (P.library[P.library.length - 1] === top) draw(g, me, 1);
      return true;
    }
    case 'concerted': {
      const kws = ['flying', 'fear', 'first strike', 'double strike', 'trample', 'vigilance'] as const;
      const have = new Set<string>();
      const cr = P.battlefield.filter(c => isType(c, 'Creature'));
      for (const c of cr) {
        const ks = [...(def(c).keywords ?? []), ...(c.kw ?? []), ...(c.skw ?? []), ...(c.pkw ?? [])].map(k => k.toLowerCase());
        for (const k of kws) if (ks.includes(k)) have.add(k);
        for (const k of ks) {
          if (k.startsWith('protection') || k.endsWith('walk') || k.includes('walk')) have.add(k);
        }
      }
      once('g', () => {
        for (const c of cr) {
          for (const k of have) if (!(c.kw ?? []).includes(k)) (c.kw ??= []).push(k);
        }
        if (have.size) log(g, `Creatures ${P.name} controls gain ${[...have].join(', ')} until end of turn.`);
      });
      return true;
    }
    case 'conquest': {
      if (src) addCounters(g, src, 'quest', 1);
      const n = (src && (src.counters?.quest ?? 0) >= 6) ? 2 : 1;
      once('t', () => { for (let i = 0; i < n; i++) createToken(g, me, BORG); log(g, `${P.name} creates ${n} Borg token${n > 1 ? 's' : ''}.`); });
      return true;
    }
    case 'harryKim': {
      const ev = ctx.item.evCard; if (!ev || !src) return true;
      if (power(g, ev) > power(g, src)) addCounters(g, src, '+1/+1', 1);
      return true;
    }
    case 'harryRem': {
      const cs = P.battlefield.filter(c => isType(c, 'Creature') && (c.counters?.['+1/+1'] ?? 0) > 0);
      const total = cs.reduce((s, c) => s + (c.counters?.['+1/+1'] ?? 0), 0);
      if (total < 2) return true;
      // pick cards, then we'll remove 2 counters preferring spread chosen by player (auto: from largest)
      once('r', () => {
        let need = 2;
        const ordered = [...cs].sort((a, b) => (b.counters?.['+1/+1'] ?? 0) - (a.counters?.['+1/+1'] ?? 0));
        for (const c of ordered) {
          if (need <= 0) break;
          const take = Math.min(need, c.counters!['+1/+1']!);
          addCounters(g, c, '+1/+1', -take);
          need -= take;
        }
      });
      return true;
    }
    case 'ezri': {
      const s = ctx.item.card; if (!s || s.origId) return true;
      const cands = P.graveyard.filter(c => isType(c, 'Creature') && c.fromBfT === g.turn);
      if (!cands.length) return true;
      const a = ask<number[]>(key, { pid: me, kind: 'pick', cards: cands, min: 0, max: 1, zone: 'graveyard', text: `${srcName}: you may have her enter as a copy of a creature card in your graveyard that was put there from the battlefield this turn.` });
      const t = cands.find(c => c.uid === a[0]); if (!t) return true;
      once('x', () => { becomeCopy(g, s, t, { name: 'Ezri Dax, Newly Joined', addTypes: [], addSub: ['Trill'] }); const d = CARDS[s.id]; if (d) { d.legendary = true; } });
      return true;
    }
    case 'fevered': {
      const pid = ctx.item.event?.player ?? g.active;
      draw(g, pid, 1);
      const q = g.players[pid];
      if (pid !== me && q.hand.length >= 4) {
        once('d', () => { dealDamage(g, ctx.item.sourceId, src, { player: pid }, 2); log(g, `${srcName} deals 2 damage to ${q.name}.`); });
      }
      return true;
    }
    case 'extraC': {
      const mana = ctx.item.event?.mana ?? g.lastMana ?? [];
      if (mana.some(s => s.split('@')[0] === 'C')) {
        once('c', () => { P.pool.push('C'); log(g, `${P.name} adds {C} (Forsaken Monument).`); });
      }
      return true;
    }
    case 'fractured': {
      const t = tCard(g, ctx, 0); if (!t) return true;
      const ownerCtl = /* controller before exile */ (t as Card);
      const ctlId = ((): number => {
        for (const p of g.players) if (p.battlefield.includes(t)) return p.id;
        return t.owner;
      })();
      once('x', () => {
        const base = t;
        exileCard(g, t);
        for (const p of g.players) if (!p.lost && p.id !== ctlId) {
          createToken(g, p.id, base.id);
        }
        log(g, `${nm(base)} is exiled. Each other player creates a token copy of it.`);
      });
      return true;
    }
    case 'grilkaGrant': {
      const t = tCard(g, ctx, 0); if (!t) return true;
      once('g', () => {
        t.grilkaT = g.turn;
        log(g, `${nm(t)} gains "whenever this deals combat damage to a player, create that many tapped Treasure tokens" until end of turn.`);
      });
      return true;
    }
    case 'guardian': {
      const ev = ctx.item.evCard; if (!ev) return true;
      const name = def(ev).name;
      const same = P.battlefield.some(c => c !== ev && isType(c, 'Creature') && def(c).name === name)
        || P.graveyard.some(c => isType(c, 'Creature') && def(c).name === name);
      if (!same) draw(g, me, 1);
      return true;
    }
    case 'guinan': {
      const cs = P.battlefield.filter(c => isType(c, 'Creature') && c.enteredTurn === g.turn);
      once('c', () => {
        for (const c of cs) addCounters(g, c, '+1/+1', 1);
        if (cs.length >= 2) draw(g, me, 1);
        if (cs.length) log(g, `${P.name} puts a +1/+1 counter on ${cs.length} creature${cs.length > 1 ? 's' : ''}${cs.length >= 2 ? ' and draws a card' : ''}.`);
      });
      return true;
    }
    case 'kangGoad': {
      const t = tCard(g, ctx, 0);
      once('g', () => {
        if (src) { src.goad = { by: me, turn: g.turn, untilSrc: src.uid }; log(g, `${nm(src)} is goaded for as long as you control it.`); }
        if (t) { t.goad = { by: me, turn: g.turn, untilSrc: src?.uid }; log(g, `${nm(t)} is goaded for as long as ${P.name} controls ${srcName}.`); }
      });
      return true;
    }
    case 'randReveal': {
      once('r', () => {
        const { hit, rest } = revealUntil(P, c => isType(c, 'Land'));
        if (hit) { enter(g, hit, me, { tapped: true }); log(g, `${P.name} puts ${nm(hit)} onto the battlefield tapped.`); }
        bottomRandom(g, P, rest);
        if (rest.length) log(g, `${rest.length} card${rest.length > 1 ? 's' : ''} go on the bottom of ${P.name}'s library.`);
      });
      return true;
    }
    case 'uhura': {
      const oppId = tPlayer(g, ctx, 0); if (oppId === undefined) return true;
      const o = g.players[oppId];
      const x = uniqLands(g, me);
      const n = Math.min(x, o.library.length);
      const exiled: Card[] = [];
      once('e', () => {
        for (let i = 0; i < n; i++) { const c = o.library.pop(); if (c) { o.exile.push(c); c.exBy = ctx.item.sourceUid; exiled.push(c); } }
        ctx.ans[`${key}:ids`] = exiled.map(c => c.uid);
        if (exiled.length) log(g, `${o.name} exiles ${exiled.map(nm).join(', ')}.`);
      });
      const ids = (ctx.ans[`${key}:ids`] as number[]) ?? [];
      const inst = ids.map(u => o.exile.find(c => c.uid === u)).filter((c): c is Card => !!c && (isType(c, 'Instant') || isType(c, 'Sorcery')));
      if (inst.length) {
        const a = ask<number[]>(key + ':cast', { pid: me, kind: 'pick', cards: inst, min: 0, max: 1, zone: 'exile', text: `${srcName}: you may cast an instant or sorcery spell from among the exiled cards without paying its mana cost.` });
        const c = inst.find(x => x.uid === a[0]);
        if (c) castNowStep(g, ctx, key + ':now', me, c, true);
      }
      once('b', () => {
        const rest = ids.map(u => o.exile.find(c => c.uid === u)).filter((c): c is Card => !!c);
        for (const c of rest) { o.exile = o.exile.filter(x => x !== c); delete c.exBy; }
        bottomRandom(g, o, rest);
      });
      return true;
    }
    case 'endCombat': {
      const inCombat = ['beginCombat', 'attackers', 'blockers', 'firstStrike', 'damage', 'endCombat'].includes(g.step);
      if (!inCombat) return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: end the combat phase?` });
      if (yes) once('e', () => { g.endCombatNow = true; log(g, `${P.name} ends the combat phase.`); });
      return true;
    }
    case 'mosswort': {
      const total = P.battlefield.filter(c => isType(c, 'Creature')).reduce((s, c) => s + power(g, c), 0);
      if (total < 10) { log(g, `Creatures ${P.name} controls have total power ${total} (need 10).`); return true; }
      const c = P.exile.find(x => x.exBy === ctx.item.sourceUid);
      if (!c) return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: play ${nm(c)} without paying its mana cost?` });
      if (!yes) return true;
      if (isType(c, 'Land')) {
        once('l', () => { P.exile = P.exile.filter(x => x !== c); delete c.exBy; enter(g, c, me, {}); });
      } else {
        c.playFree = true; c.mayPlay = g.turn; c.playBy = me;
        const cast = castNowStep(g, ctx, key + ':cast', me, c, true);
        if (!cast) { delete c.playFree; delete c.mayPlay; delete c.playBy; }
      }
      return true;
    }
    case 'qonosMana': {
      const col = asColor(ask<string>(key, { pid: me, kind: 'color', options: COLORS, text: 'Add one mana of any color. It lasts until end of turn.' }));
      once('m', () => { P.pool.push(`${col}@keep`); P.keepT = g.turn; log(g, `${P.name} adds {${col}} (doesn't empty as steps and phases end).`); });
      return true;
    }
    case 'queenDiamond': {
      const n = src ? (src.counters?.charge ?? 0) : 0;
      const col = asColor(ask<string>(key, { pid: me, kind: 'color', options: COLORS, text: `Choose a color. Add ${n} mana of that color, usable only to cast your commander.` }));
      once('m', () => { for (let i = 0; i < n; i++) P.pool.push(`${col}@commander:`); if (n) log(g, `${P.name} adds ${n} {${col}} (spend only to cast your commander).`); });
      return true;
    }
    case 'manifestCtl': {
      const t = tCard(g, ctx, 0);
      const pid = t ? t.owner : me;
      const q = g.players[pid];
      once('m', () => { manifestTop(g, q); });
      return true;
    }
    case 'botanyExile': {
      for (const o of opponents(g, me)) {
        if (!o.graveyard.length) continue;
        const a = ask<number[]>(`${key}:o${o.id}`, { pid: o.id, kind: 'pick', cards: [...o.graveyard], min: 1, max: 1, zone: 'graveyard', text: `${srcName}: exile a card from your graveyard.` });
        once(`o${o.id}`, () => {
          const c = o.graveyard.find(x => x.uid === a[0]);
          if (c) { o.graveyard = o.graveyard.filter(x => x !== c); o.exile.push(c); c.exBy = ctx.item.sourceUid; log(g, `${o.name} exiles ${nm(c)}.`); }
        });
      }
      if (P.graveyard.length) {
        const a = ask<number[]>(`${key}:you`, { pid: me, kind: 'pick', cards: [...P.graveyard], min: 0, max: 1, zone: 'graveyard', text: `${srcName}: you may exile a card from your graveyard.` });
        once('you', () => {
          const c = P.graveyard.find(x => x.uid === a[0]);
          if (c) { P.graveyard = P.graveyard.filter(x => x !== c); P.exile.push(c); c.exBy = ctx.item.sourceUid; log(g, `${P.name} exiles ${nm(c)}.`); }
        });
      }
      return true;
    }
    case 'botanyReturn': {
      const cs = g.players.flatMap(p => p.exile.filter(c => c.exBy === ctx.item.sourceUid && c.owner === me && isType(c, 'Creature')));
      once('r', () => {
        for (const c of cs) { const q = g.players[c.owner]; q.exile = q.exile.filter(x => x !== c); delete c.exBy; enter(g, c, me, {}); }
        if (cs.length) log(g, `${cs.map(nm).join(', ')} return to the battlefield.`);
      });
      return true;
    }
    case 'animosity': {
      const ev = ctx.item.evCard; if (!ev || ev.attacking === undefined) return true;
      const subs = new Set((def(ev).sub ?? []).filter(s => !['Aura', 'Equipment', 'Fortification', 'Background'].includes(s)));
      // also creature types from type line; subtypes include races/classes
      let n = 0;
      for (const c of P.battlefield) {
        if (c === ev || c.attacking === undefined || !isType(c, 'Creature')) continue;
        if ((def(c).sub ?? []).some(s => subs.has(s))) n++;
      }
      if (n) once('p', () => { ev.pp += n; log(g, `${nm(ev)} gets +${n}/+0 until end of turn.`); });
      return true;
    }
    case 'shoreLeave': {
      const s = src; const t = tCard(g, ctx, 0); if (!s || !t) return true;
      once('x', () => { becomeCopy(g, s, t, { nonlegendary: true, eot: true, addTypes: ['Artifact'], addSub: ['Robot'] }); });
      return true;
    }
    case 'galileo': {
      const ts = (ctx.item.targets ?? []).map((t, i) => tCard(g, ctx, i)).filter((c): c is Card => !!c);
      const uniq = [...new Map(ts.map(c => [c.uid, c])).values()].slice(0, 7);
      once('g', () => { for (const c of uniq) { (c.kw ??= []).push('flying'); } if (uniq.length) log(g, `${uniq.map(nm).join(', ')} gain flying until end of turn.`); });
      return true;
    }
    case 'sins': {
      const pid = tPlayer(g, ctx, 0); if (pid === undefined) return true;
      const q = g.players[pid];
      const n = q.graveyard.filter(c => isType(c, 'Creature')).length;
      once('x', () => {
        const gy = [...q.graveyard];
        for (const c of gy) { q.graveyard = q.graveyard.filter(x => x !== c); q.exile.push(c); }
        log(g, `${q.name}'s graveyard is exiled (${n} creature card${n === 1 ? '' : 's'}).`);
        for (const o of opponents(g, me)) loseLife(g, o.id, n);
      });
      return true;
    }
    case 'communicator': {
      const ev = ctx.item.evCard;
      const others = P.battlefield.filter(c => c !== ev && isType(c, 'Creature') && P.battlefield.some(eq => def(eq).sub?.includes('Communicator') && eq.attachedTo === c.uid)).length;
      const x = others;
      if (x > 0) draw(g, me, x);
      const lands = P.hand.filter(c => isType(c, 'Land'));
      if (!lands.length || x <= 0) return true;
      const a = ask<number[]>(key, { pid: me, kind: 'pick', cards: lands, min: 0, max: Math.min(x, lands.length), zone: 'hand', text: `${srcName}: you may put up to ${x} land card${x > 1 ? 's' : ''} from your hand onto the battlefield tapped.` });
      once('l', () => {
        for (const u of a) {
          const c = P.hand.find(x => x.uid === u);
          if (c) { P.hand = P.hand.filter(x => x !== c); enter(g, c, me, { tapped: true }); }
        }
      });
      return true;
    }
    case 'stonespeaker': {
      const ids = [...new Set((ctx.item.targets ?? []).map(t => t?.player).filter((x): x is number => x !== undefined))];
      once('x', () => {
        for (const pid of ids) {
          const q = g.players[pid];
          const gy = [...q.graveyard];
          for (const c of gy) { q.graveyard = q.graveyard.filter(x => x !== c); q.exile.push(c); }
          if (gy.length) log(g, `${q.name}'s graveyard is exiled.`);
        }
      });
      return true;
    }
    case 'tpring': {
      const a = tCard(g, ctx, 0); const b = tCard(g, ctx, 1);
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: have ${a ? nm(a) : 'your creature'} and ${b ? nm(b) : "an opponent's creature"} fight?` });
      if (!yes || !a || !b) return true;
      once('f', () => {
        
        dealDamage(g, a.id, a, { card: b }, power(g, a));
        dealDamage(g, b.id, b, { card: a }, power(g, b));
        a.fightT = g.turn; b.fightT = g.turn;
        log(g, `${nm(a)} fights ${nm(b)}.`);
      });
      // Delayed: whenever a creature that fought this way dies this turn, draw
      once('w', () => { (g.watch ??= []).push({ ev: 'dies', controller: me, sourceId: ctx.item.sourceId, sourceUid: ctx.item.sourceUid, label: 'Draw a card', effects: [{ op: 'draw', n: 1, pl: 'you' }], until: 'eot', by: me, fightT: g.turn } as never); });
      return true;
    }
    case 'kahlessPromise': {
      once('r', () => {
        const cs = P.graveyard.filter(c => isType(c, 'Creature') && isTypeOrSub(def(c), 'Klingon') || isType(c, 'Creature') && isTypeOrSub(def(c), 'Warrior'));
        // The sacrificed card is already in the graveyard; "all other" excludes it — last sacrificed this resolution is ctx.chosen
        const skip = new Set((ctx.chosen ?? []).map(c => c.uid));
        for (const c of cs) {
          if (skip.has(c.uid)) continue;
          P.graveyard = P.graveyard.filter(x => x !== c);
          enter(g, c, me, {});
        }
        log(g, `${P.name} returns Klingon and Warrior creature cards from their graveyard to the battlefield.`);
      });
      return true;
    }
    case 'transwarp': {
      const milled = ctx.chosen.filter(c => isType(c, 'Artifact'));
      if (!milled.length) return true;
      const a = ask<number[]>(key, { pid: me, kind: 'pick', cards: milled, min: 0, max: Math.min(2, milled.length), zone: 'graveyard', text: `${srcName}: you may put up to two artifact cards milled this way into your hand.` });
      once('t', () => {
        for (const u of a) {
          const c = P.graveyard.find(x => x.uid === u);
          if (c) { P.graveyard = P.graveyard.filter(x => x !== c); P.hand.push(c); log(g, `${P.name} puts ${nm(c)} into their hand.`); }
        }
      });
      return true;
    }
    case 'tribbleCluster': {
      const ev = ctx.item.evCard ?? src;
      const lki = ev?.lki ?? (ev ? { p: def(ev).power ?? 0, t: def(ev).toughness ?? 0 } : { p: 0, t: 0 });
      const x = Math.max(0, ev && findCard(g, ev.uid) ? power(g, ev) : lki.p);
      once('t', () => {
        for (let i = 0; i < x; i++) {
          const c = createToken(g, me, { ...TRIBBLE, kws: ["_cantblock"] });
        }
        if (x) log(g, `${P.name} creates ${x} Tribble token${x === 1 ? '' : 's'}.`);
      });
      return true;
    }
    case 'tuvok': {
      const cs = [tCard(g, ctx, 0), tCard(g, ctx, 1)].filter((c): c is Card => !!c && c.attacking !== undefined);
      for (const c of cs) {
        const yes = ask<boolean>(`${key}:${c.uid}`, { pid: me, kind: 'may', text: `${srcName}: reselect who ${nm(c)} is attacking?` });
        if (!yes) continue;
        const defs = g.players.filter(p => !p.lost && p.id !== me);
        const pws = defs.flatMap(p => p.battlefield.filter(x => isType(x, 'Planeswalker') || isTypeOrSub(def(x), 'Battle')));
        const labels = [...defs.map(p => p.name), ...pws.map(nm)];
        if (!labels.length) continue;
        const pick = ask<string>(`${key}:to:${c.uid}`, { pid: me, kind: 'color', options: labels, text: `${srcName}: ${nm(c)} attacks whom?` });
        once(`r${c.uid}`, () => {
          const pw = pws.find(x => nm(x) === pick);
          const pl = defs.find(p => p.name === pick);
          if (pw) { c.attacking = pw.owner; c.atkPw = pw.uid; }
          else if (pl) { c.attacking = pl.id; delete c.atkPw; }
          log(g, `${nm(c)} is now attacking ${pick}.`);
        });
      }
      return true;
    }
    case 'phaseSelf': {
      once('s', () => { if (src) phaseOut(g, src); });
      return true;
    }
    case 'farragut': {
      const cands = P.hand.filter(c => isType(c, 'Creature'));
      if (!cands.length) return true;
      const a = ask<number[]>(key, { pid: me, kind: 'pick', cards: cands, min: 0, max: 1, zone: 'hand', text: `${srcName}: you may put a creature card from your hand onto the battlefield. It gains haste, and at the next end step it's put on the bottom of your library and you draw a card.` });
      const c = cands.find(x => x.uid === a[0]); if (!c) return true;
      once('p', () => {
        P.hand = P.hand.filter(x => x !== c);
        enter(g, c, me, {});
        (c.kw ??= []).push('haste');
        (g.delayed ??= []).push({ at: 'endStep', turnAfter: g.step === 'end' || g.step === 'cleanup' ? g.turn : g.turn - 1, controller: me, sourceId: ctx.item.sourceId, sourceUid: ctx.item.sourceUid, label: `put ${nm(c)} on the bottom of its owner's library, then draw a card`, effects: [{ op: 'script', kind: 'farragutEnd', n: c.uid }] });
        log(g, `${nm(c)} enters with haste and will go to the bottom of the library at the next end step.`);
      });
      return true;
    }
    case 'farragutEnd': {
      const u = e.n as number;
      const c = findCard(g, u);
      if (c) {
        once('b', () => { moveCard(g, c, 'bottom'); log(g, `${nm(c)} is put on the bottom of its owner's library.`); });
        draw(g, me, 1);
      }
      return true;
    }
    case 'prometheus': {
      const n = ctx.item.event?.amount ?? 0;
      const vs = ctx.item.event?.player;
      if (n <= 0) return true;
      once('d', () => {
        
        for (const o of opponents(g, me)) if (o.id !== vs) {
          dealDamage(g, ctx.item.sourceId, src, { player: o.id }, n);
          log(g, `${srcName} deals ${n} damage to ${o.name}.`);
        }
      });
      return true;
    }
    case 'unificationI': {
      const t = tCard(g, ctx, 0); if (!t) return true;
      const owner = t.owner;
      draw(g, owner, 2);
      once('s', () => { moveCard(g, t, 'top'); shuffle(g, g.players[owner].library); log(g, `${nm(t)} is shuffled into ${g.players[owner].name}'s library.`); });
      return true;
    }
    case 'unificationII': {
      const cands = [...P.hand, ...P.graveyard].filter(c => isTypeOrSub(def(c), 'Spacecraft'));
      if (!cands.length) return true;
      const a = ask<number[]>(key, { pid: me, kind: 'pick', cards: cands, min: 0, max: 1, zone: 'any', text: `${srcName}: you may put a Spacecraft card from your hand or graveyard onto the battlefield.` });
      const c = cands.find(x => x.uid === a[0]); if (!c) return true;
      once('p', () => {
        P.hand = P.hand.filter(x => x !== c);
        P.graveyard = P.graveyard.filter(x => x !== c);
        enter(g, c, me, {});
        log(g, `${P.name} puts ${nm(c)} onto the battlefield.`);
      });
      return true;
    }
    case 'voq': {
      const s = ctx.item.card; if (!s || s.origId) return true;
      const cands = g.players.flatMap(p => p.graveyard.filter(c => isType(c, 'Creature')));
      if (!cands.length) return true;
      const a = ask<number[]>(key, { pid: me, kind: 'pick', cards: cands, min: 0, max: 1, zone: 'graveyard', text: `${srcName}: you may have him enter as a copy of a creature card in a graveyard.` });
      const t = cands.find(c => c.uid === a[0]); if (!t) return true;
      once('x', () => { becomeCopy(g, s, t, { addSub: ['Klingon', 'Spy'] }); (s.pkw ??= []).push('menace'); });
      return true;
    }
    case 'voxUndaunted': {
      once('v', () => { P.voxUndaunted = g.turn; log(g, `The next artifact creature spell and the next spacecraft spell ${P.name} casts this turn have undaunted.`); });
      return true;
    }
    case 'rightVengeance': {
      once('w', () => {
        (g.watch ??= []).push({ ev: 'combatDamagePlayer', controller: me, sourceId: ctx.item.sourceId, sourceUid: ctx.item.sourceUid, label: 'Destroy that creature and create a Klingon', effects: [{ op: 'destroy', who: 'ev' }, { op: 'token', n: 1, tok: KLINGON }], until: 'eot', by: me, vsYou: true } as never);
        log(g, `Until end of turn, whenever a creature deals combat damage to ${P.name}, destroy that creature and create a Klingon Warrior.`);
      });
      return true;
    }
    case 'hideaway': {
      const n = def(src ?? { id: '' })?.hideaway ?? 4;
      const k = Math.min(n, P.library.length);
      if (!k || !src) return true;
      const top = P.library.slice(-k).reverse();
      const a = ask<number[]>(key, { pid: me, kind: 'pick', cards: top, min: 1, max: 1, zone: 'library', text: `Hideaway ${n}: exile one card face down, then put the rest on the bottom in a random order.` });
      once('h', () => {
        const c = top.find(x => x.uid === a[0]) ?? top[0];
        P.library = P.library.filter(x => !top.includes(x));
        P.exile.push(c); c.exBy = src.uid; c.faceDown = true;
        const rest = top.filter(x => x !== c);
        bottomRandom(g, P, rest);
        log(g, `${P.name} exiles a card face down with ${nm(src)} (hideaway).`);
      });
      return true;
    }
    case 'squad': {
      const n = (ctx.item.card?.squadN ?? src?.squadN ?? 0) as number;
      const base = ctx.item.evCard ?? src;
      if (!base || n <= 0) return true;
      once('s', () => {
        for (let i = 0; i < n; i++) createToken(g, me, base.id);
        log(g, `${P.name} creates ${n} token${n === 1 ? '' : 's'} that are copies of ${nm(base)} (squad).`);
      });
      return true;
    }
    case 'celebrant': {
      const c = ctx.item.evCard ?? src;
      if (!c || c.exertedTurn === g.turn) return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: exert it? When you do, untap all other creatures you control and after this phase there is an additional combat phase.` });
      if (!yes) return true;
      once('x', () => {
        c.exertedTurn = g.turn;
        c.tapped = true;
        for (const x of P.battlefield) if (x !== c && isType(x, 'Creature')) x.tapped = false;
        g.extraCombats = (g.extraCombats ?? 0) + 1;
        log(g, `${P.name} exerts ${nm(c)}, untaps their other creatures, and will get an additional combat phase.`);
      });
      return true;
    }
    default:
      return false;
  }
}

function manifestTop(g: Game, p: Player) {
  const c = p.library.pop();
  if (!c) return;
  c.faceDown = true;
  c.manifest = true;
  // Face-down 2/2 creature. become a temporary def overlay.
  const id = c.id;
  const d: CardDef = { id: `${id}#manifest`, name: 'Manifested creature', types: ['Creature'], cost: { generic: 0 }, colors: [], power: 2, toughness: 2, text: '', typeLine: 'Creature', token: false };
  CARDS[d.id] = d;
  c.origId ??= c.id;
  c.id = d.id;
  enter(g, c, p.id, {});
  log(g, `${p.name} manifests the top card of their library.`);
}

export const TREK_TRIBBLE = TRIBBLE;
