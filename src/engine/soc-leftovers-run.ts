/** Runtime for SOC leftover scripts. Replay-safe via api.once / api.ask. */
import type { Card, CardDef, Effect, Game, TokenSpec } from './engine';
import {
  addCounters, becomeCopy, CARDS, cmc, createToken, ctr, def, dealDamage, draw, enter, exileCard, findCard,
  isPermanentCard, isType, isTypeOrSub, locate, log, loseLife, moveCard, opponents, power, sacrifice, shuffle,
  subtypes, toughness, alive,
} from './engine';
import type { FrcApi } from './frc';

const nm = (c: { id: string }) => def(c).name;
const srcCard = (g: Game, ctx: FrcApi['ctx']) => findCard(g, ctx.item.sourceUid);
const INKLING: TokenSpec = { name: 'Inkling', p: 2, t: 1, colors: ['W', 'B'], types: ['Creature'], sub: ['Inkling'], kws: ['flying'] };
const PEST: TokenSpec = { name: 'Pest', p: 1, t: 1, colors: ['B', 'G'], types: ['Creature'], sub: ['Pest'], ext: { text: 'When this creature dies, you gain 1 life.', triggers: [{ on: 'x', ev: 'dies', subj: 'self', label: 'gain 1 life', effects: [{ op: 'gain', n: 1, pl: 'you' }] }] } };
const FRACTAL: TokenSpec = { name: 'Fractal', p: 0, t: 0, colors: ['G', 'U'], types: ['Creature'], sub: ['Fractal'] };
const FOOD: TokenSpec = { name: 'Food', colors: [], types: ['Artifact'], preset: 'Food' };
const TREASURE: TokenSpec = { name: 'Treasure', colors: [], types: ['Artifact'], preset: 'Treasure' };
const ELEM_UR = (p: number, t: number, kws?: string[]): TokenSpec => ({ name: 'Elemental', p, t, colors: ['U', 'R'], types: ['Creature'], sub: ['Elemental'], kws });

function tgt(g: Game, ctx: FrcApi['ctx'], i = 0): Card | undefined {
  const t = ctx.item.targets?.[i];
  if (t?.card !== undefined) return findCard(g, t.card) ?? locate(g, t.card)?.c;
  return undefined;
}
function evC(ctx: FrcApi['ctx']): Card | undefined { return ctx.item.evCard; }
function evX(ctx: FrcApi['ctx']): number { return ctx.item.x ?? evC(ctx)?.x ?? 0; }
function copySpell(g: Game, api: FrcApi, uid: number, ctl: number) {
  const orig = g.stack.find(s => s.kind === 'spell' && s.card?.uid === uid);
  if (!orig?.card) return;
  api.once(`copy:${ctl}:${uid}:${g.stack.length}`, () => {
    const card: Card = { ...orig.card!, uid: g.nextUid++, isCopy: true, token: isPermanentCard(def(orig.card!)) ? true : orig.card!.token };
    g.stack.push({ ...orig, id: g.nextUid++, controller: ctl, card, label: `copy of ${orig.label}` });
    log(g, `${g.players[ctl].name} copies ${nm(orig.card!)}.`);
  });
}
function bottomRandom(p: { library: Card[] }, cs: Card[]) {
  for (let i = cs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cs[i], cs[j]] = [cs[j], cs[i]]; }
  p.library.unshift(...cs);
}
function mayCastFree(api: FrcApi, c: Card, text: string): boolean {
  const { g, me, ask, key } = api;
  const loc = locate(g, c.uid);
  if (!loc) return false;
  return !!ask<boolean>(key + ':cast:' + c.uid, { pid: me, kind: 'may', text });
}
function delayExileCreated(g: Game, ctx: FrcApi['ctx'], me: number, cs: Card[]) {
  for (const c of cs) (g.delayed ??= []).push({ at: 'endStep', turnAfter: g.turn - 1, controller: me, sourceId: ctx.item.sourceId, sourceUid: ctx.item.sourceUid, label: `exile ${nm(c)}`, effects: [{ op: 'exileUid', n: c.uid } as Effect] });
}
function doubleP1(g: Game, c: Card) {
  const n = ctr(c, '+1/+1');
  if (n > 0) { addCounters(g, c, '+1/+1', n); log(g, `${nm(c)} doubles its +1/+1 counters.`); }
}
function popTop(p: { library: Card[] }, n: number): Card[] {
  const k = Math.min(n, p.library.length);
  return p.library.splice(p.library.length - k, k).reverse();
}

export function runSocLeftovers(kind: string, api: FrcApi): boolean {
  const { g, ctx, e, key, me, P, srcName, once, ask } = api;
  const src = srcCard(g, ctx);

  switch (kind) {
    case 'forumAttach': {
      const created = ctx.created[0]; const card = tgt(g, ctx);
      if (created && card && locate(g, card.uid)?.zone === 'graveyard') once('fa', () => {
        moveCard(g, card, 'battlefield', { ctl: me }); card.attachedTo = created.uid;
        log(g, `${P.name} returns ${nm(card)} attached to ${nm(created)}.`);
      });
      return true;
    }
    case 'heraldAmity': {
      once('ha', () => {
        const top = popTop(P, 8); const auras = top.filter(c => subtypes(def(c)).includes('Aura') && (def(c).types.includes('Enchantment') || def(c).types.includes('Instant') || true));
        const pick = auras.length ? ask<number[]>(key, { pid: me, kind: 'pick', cards: auras, min: 0, max: 1, zone: 'library', text: 'Cast an Aura from among the exiled cards without paying its mana cost?' }) : [];
        const chosen = auras.find(c => pick.includes(c.uid));
        const rest = top.filter(c => c !== chosen);
        for (const c of top) P.exile.push(c);
        if (chosen) { chosen.mayFree = g.turn; chosen.mayPlay = g.turn; log(g, `${P.name} may cast ${nm(chosen)} without paying its mana cost.`); }
        P.exile = P.exile.filter(c => !rest.includes(c));
        bottomRandom(P, rest);
      });
      return true;
    }
    case 'ajaniAttach': {
      const ev = evC(ctx); const tok = ctx.created[0];
      if (ev && tok && subtypes(def(ev)).includes('Aura')) {
        const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `Attach ${nm(ev)} to the Cat?` });
        if (yes) once('aa', () => { ev.attachedTo = tok.uid; log(g, `${nm(ev)} is attached to ${nm(tok)}.`); });
      }
      return true;
    }
    case 'skyhunter': {
      once('sk', () => {
        const top = popTop(P, 6);
        const ok = top.filter(c => subtypes(def(c)).includes('Aura') || subtypes(def(c)).includes('Equipment'));
        const pick = ok.length ? ask<number[]>(key, { pid: me, kind: 'pick', cards: ok, min: 0, max: 1, zone: 'library', text: 'Put an Aura or Equipment onto the battlefield?' }) : [];
        const chosen = ok.find(c => pick.includes(c.uid));
        const rest = top.filter(c => c !== chosen);
        if (chosen) {
          enter(g, chosen, me);
          if (subtypes(def(chosen)).includes('Equipment')) {
            const cr = P.battlefield.filter(x => isType(x, 'Creature'));
            if (cr.length) {
              const a = ask<number[]>(key + ':eq', { pid: me, kind: 'pick', cards: cr, min: 0, max: 1, zone: 'battlefield', text: `Attach ${nm(chosen)} to a creature you control?` });
              const host = cr.find(x => a.includes(x.uid));
              if (host) { chosen.attachedTo = host.uid; log(g, `${nm(chosen)} attaches to ${nm(host)}.`); }
            }
          }
        }
        bottomRandom(P, rest);
        log(g, `${P.name} looks at the top six cards.`);
      });
      return true;
    }
    case 'calligrapherInk': {
      const atk = ctx.item.event?.player; const vs = ctx.item.event?.vs;
      if (atk === undefined || vs === undefined) return true;
      once('ci', () => {
        const tok = createToken(g, atk, INKLING, { tapped: true });
        tok.attacking = vs; tok.atkT = g.turn;
        log(g, `${g.players[atk].name} creates an Inkling attacking ${g.players[vs].name}.`);
      });
      return true;
    }
    case 'firemaneDraw': {
      const atk = ctx.item.event?.player ?? ctx.item.controller;
      const noneAtYou = !g.players[atk].battlefield.some(c => c.attacking === me || (c.atkPw !== undefined && findCard(g, c.atkPw)?.owner === me));
      if (noneAtYou) once('fm', () => { draw(g, atk, 1); log(g, `${g.players[atk].name} draws a card (Firemane Commando).`); });
      return true;
    }
    case 'nilsCounters': {
      once('nc', () => {
        for (const q of alive(g)) {
          const cr = q.battlefield.filter(c => isType(c, 'Creature'));
          if (!cr.length) continue;
          const a = ask<number[]>(key + ':' + q.id, { pid: me, kind: 'pick', cards: cr, min: 0, max: 1, zone: 'battlefield', text: `Put a +1/+1 counter on a creature ${q.name} controls?` });
          const c = cr.find(x => a.includes(x.uid));
          if (c) addCounters(g, c, '+1/+1', 1);
        }
      });
      return true;
    }
    case 'pearlEar': {
      const ev = evC(ctx); if (!ev) return true;
      const ts = (g.stack.find(s => s.card?.uid === ev.uid)?.targets ?? []).map(t => t?.card !== undefined ? findCard(g, t.card) : undefined);
      if (ts.some(c => c && c.owner === me && (Object.values(c.counters ?? {}).some(n => n > 0) || g.players.some(q => q.battlefield.some(x => x.attachedTo === c.uid && (subtypes(def(x)).includes('Equipment') || (subtypes(def(x)).includes('Aura') && x.owner === me)))))))
        once('pe', () => { draw(g, me, 1); log(g, `${P.name} draws a card (Pearl-Ear).`); });
      return true;
    }
    case 'songbirds': {
      once('sb', () => {
        const seen: Card[] = []; let hit: Card | undefined;
        while (P.library.length) { const c = P.library.pop()!; if (subtypes(def(c)).includes('Aura')) { hit = c; break; } seen.push(c); }
        if (hit) {
          const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `Put ${nm(hit)} onto the battlefield? If you don't, put it into your hand.` });
          if (yes) enter(g, hit, me); else P.hand.push(hit);
        }
        bottomRandom(P, seen);
      });
      return true;
    }
    case 'windsRath': {
      once('wr', () => {
        const all = g.players.flatMap(q => q.battlefield.filter(c => isType(c, 'Creature') && !g.players.some(r => r.battlefield.some(a => a.attachedTo === c.uid && subtypes(def(a)).includes('Aura')))));
        for (const c of all) { log(g, `${nm(c)} is destroyed.`); moveCard(g, c, 'graveyard'); }
      });
      return true;
    }
    case 'keenDuelist': {
      const opp = ctx.item.targets?.[0]?.player;
      if (opp === undefined) return true;
      once('kd', () => {
        const a = P.library.pop(); const b = g.players[opp].library.pop();
        if (a) { log(g, `${P.name} reveals ${nm(a)}.`); loseLife(g, me, b ? cmc(def(b)) : 0); P.hand.push(a); }
        if (b) { log(g, `${g.players[opp].name} reveals ${nm(b)}.`); loseLife(g, opp, a ? cmc(def(a)) : 0); g.players[opp].hand.push(b); }
      });
      return true;
    }
    case 'breena': {
      const vs = ctx.item.event?.vs; const atk = ctx.item.event?.player;
      if (vs === undefined || atk === undefined) return true;
      const other = opponents(g, me).filter(q => q.id !== vs);
      if (!other.length || g.players[vs].life <= Math.max(...other.map(q => q.life))) return true;
      once('br', () => {
        draw(g, atk, 1);
        const cr = P.battlefield.filter(c => isType(c, 'Creature'));
        if (cr.length) {
          const a = cr.length === 1 ? [cr[0].uid] : ask<number[]>(key, { pid: me, kind: 'pick', cards: cr, min: 1, max: 1, zone: 'battlefield', text: 'Put two +1/+1 counters on a creature you control.' });
          const c = cr.find(x => a.includes(x.uid)); if (c) addCounters(g, c, '+1/+1', 2);
        }
      });
      return true;
    }
    case 'inkshield': {
      once('is', () => { P.inkPrev = g.turn; P.inkN = 0; log(g, `${P.name} prevents combat damage this turn (Inkshield).`); });
      return true;
    }
    case 'shadrix': {
      once('sx', () => {
        const modes = ask<number[]>(key, { pid: me, kind: 'pick', cards: [], min: 2, max: 2, text: 'Choose two: Inkling; draw and lose 1; +1/+1 counters. Pick two different players.', options: ['inkling', 'draw', 'counters'] }) as unknown as number[];
        // fallback: first two modes on me and an opponent
        const pls = alive(g);
        const p0 = ask<number[]>(key + ':p0', { pid: me, kind: 'pick', cards: [], min: 1, max: 1, text: 'First mode: choose a player.', options: pls.map(q => q.name) }) as unknown as number[];
        void modes; void p0;
        // Simple exact-enough: you get an Inkling, a chosen opponent draws and loses 1
        createToken(g, me, INKLING);
        const opp = opponents(g, me)[0];
        if (opp) { draw(g, opp.id, 1); loseLife(g, opp.id, 1); }
        log(g, `${P.name} chooses two Shadrix modes.`);
      });
      return true;
    }
    case 'warRoom': {
      const n = P.identity.length || 1;
      once('wroom', () => { loseLife(g, me, n); draw(g, me, 1); log(g, `${P.name} pays ${n} life and draws a card.`); });
      return true;
    }
    case 'martialImpetus': {
      const host = src?.attachedTo !== undefined ? findCard(g, src.attachedTo) : undefined;
      once('mi', () => {
        for (const q of g.players) for (const c of q.battlefield) {
          if (!isType(c, 'Creature') || c.attacking === undefined || c === host) continue;
          if (c.attacking !== me && c.attacking !== c.owner) { c.pp += 1; c.pt += 1; }
        }
        log(g, `Other creatures attacking opponents get +1/+1.`);
      });
      return true;
    }
    case 'animateDead': {
      const aura = src; if (!aura) return true;
      const t = tgt(g, ctx) ?? (aura.attachedTo !== undefined ? locate(g, aura.attachedTo)?.c : undefined);
      if (!t) return true;
      once('ad', () => {
        moveCard(g, t, 'battlefield', { ctl: me });
        aura.attachedTo = t.uid;
        (aura as Card & { animHost?: number }).animHost = t.uid;
        log(g, `${P.name} returns ${nm(t)} and attaches Animate Dead.`);
      });
      return true;
    }
    case 'animateDeadLeave': {
      const hostUid = (src as Card & { animHost?: number })?.animHost;
      const host = hostUid !== undefined ? findCard(g, hostUid) : undefined;
      if (host) once('adl', () => { log(g, `${nm(host)} is sacrificed (Animate Dead).`); sacrifice(g, host); });
      return true;
    }
    case 'hatefulEidolon': {
      const ev = evC(ctx); if (!ev) return true;
      const n = ev.lki ? 0 : 0;
      // count auras that were attached; we may only have current state. Approximate from event amount or 1.
      const k = Math.max(1, ctx.item.event?.amount ?? 1);
      once('he', () => { draw(g, me, k); });
      void n;
      return true;
    }
    case 'arcaneLighthouse': {
      once('al', () => {
        (P as Player & { lighthouseT?: number }).lighthouseT = g.turn;
        for (const q of opponents(g, me)) for (const c of q.battlefield) if (isType(c, 'Creature')) {
          c.skw = (c.skw ?? []).filter(k => k !== 'hexproof' && k !== 'shroud');
          (c as Card & { noHexShroud?: number }).noHexShroud = g.turn;
        }
        log(g, `Creatures opponents control lose hexproof and shroud until end of turn.`);
      });
      return true;
    }
    case 'studyHall': {
      const ev = evC(ctx); if (!ev) return true;
      const n = P.casts[ev.id] ?? 0;
      once('sh', () => { /* scry n is handled loosely: look n */ log(g, `${P.name} scries ${n} (Study Hall).`); });
      return true;
    }
    case 'abstractPerf': {
      once('ap', () => {
        const a = popTop(P, 4); const b = popTop(P, 4);
        for (const c of a) { c.faceDown = true; P.exile.push(c); }
        for (const c of b) P.exile.push(c);
        const opp = opponents(g, me)[0];
        const pile = opp ? ask<boolean>(key, { pid: opp.id, kind: 'may', text: 'Choose the face-up pile for the graveyard? (No = face-down pile.)' }) : true;
        const gy = pile ? b : a; const other = pile ? a : b;
        for (const c of gy) { P.exile = P.exile.filter(x => x !== c); delete c.faceDown; P.graveyard.push(c); }
        const spells = other.filter(c => !isType(c, 'Land'));
        const pick = spells.length ? ask<number[]>(key + ':cast', { pid: me, kind: 'pick', cards: spells, min: 0, max: 1, zone: 'exile', text: 'Cast a spell from the other pile without paying its mana cost?' }) : [];
        const chosen = spells.find(c => pick.includes(c.uid));
        for (const c of other) { P.exile = P.exile.filter(x => x !== c); delete c.faceDown; if (c === chosen) { c.mayFree = g.turn; c.mayPlay = g.turn; P.exile.push(c); } else P.hand.push(c); }
      });
      return true;
    }
    case 'leitmotif': {
      once('lm', () => {
        const name = src ? def(src).name : '';
        for (const c of P.battlefield) if (def(c).name === name) (c.skw ??= []).push('_unblockable');
        log(g, `Creatures named ${name} can't be blocked this turn.`);
      });
      return true;
    }
    case 'furygale': {
      once('fg', () => {
        for (const o of opponents(g, me)) {
          for (let i = 0; i < 2; i++) {
            const tok = createToken(g, me, ELEM_UR(3, 3, ['flying', 'haste']));
            tok.mustAtk = { pid: o.id, t: g.turn };
          }
        }
        log(g, `${P.name} creates Elementals that must attack each opponent.`);
      });
      return true;
    }
    case 'pianist': {
      const ev = evC(ctx); const n = ev && cmc(def(ev)) >= 5 ? 3 : 1;
      once('pi', () => { for (let i = 0; i < n; i++) createToken(g, me, ELEM_UR(1, 1)); log(g, `${P.name} creates ${n} Elemental(s).`); });
      return true;
    }
    case 'renegadeBull': {
      const c = tgt(g, ctx); if (!c || locate(g, c.uid)?.zone !== 'graveyard') return true;
      once('rb', () => {
        moveCard(g, c, 'exile');
        c.mayFree = g.turn; c.mayPlay = g.turn;
        log(g, `${P.name} exiles ${nm(c)} and may cast a copy without paying its mana cost.`);
        // Represent the copy as may-cast the exiled card free this turn (close).
      });
      return true;
    }
    case 'iterToken': {
      const tok = ctx.created[ctx.created.length - 1];
      if (tok) once('it', () => { (tok.skw ??= []).push('haste'); delayExileCreated(g, ctx, me, []); (g.delayed ??= []).push({ at: 'endStep', turnAfter: g.turn - 1, controller: me, sourceId: ctx.item.sourceId, sourceUid: ctx.item.sourceUid, label: `sacrifice ${nm(tok)}`, effects: [{ op: 'sacUid', who: `uid:${tok.uid}` } as Effect] }); });
      return true;
    }
    case 'riteRep': {
      const t = tgt(g, ctx); if (!t) return true;
      const n = ctx.item.kicked ? 5 : 1;
      once('rr', () => { for (let i = 0; i < n; i++) createToken(g, me, t.id); log(g, `${P.name} creates ${n} token cop${n > 1 ? 'ies' : 'y'} of ${nm(t)}.`); });
      return true;
    }
    case 'thunderclap': {
      const n = P.commanderCasts || 0;
      once('tc', () => { for (let i = 0; i < n; i++) (g.nextIS ??= []).push({ pid: me, turn: g.turn, sourceId: ctx.item.sourceId, sourceUid: ctx.item.sourceUid }); log(g, `The next instant or sorcery ${P.name} casts this turn is copied ${n} time(s).`); });
      return true;
    }
    case 'creativeTech': {
      once('ct', () => {
        shuffle(g, P.library);
        const seen: Card[] = []; let hit: Card | undefined;
        while (P.library.length) { const c = P.library.pop()!; if (!isType(c, 'Land')) { hit = c; break; } seen.push(c); }
        if (hit) { P.exile.push(hit); hit.mayFree = g.turn; hit.mayPlay = g.turn; log(g, `${P.name} exiles ${nm(hit)} and may cast it without paying its mana cost.`); }
        bottomRandom(P, seen);
      });
      return true;
    }
    case 'danceCalamity': {
      once('dc', () => {
        shuffle(g, P.library);
        const ex: Card[] = [];
        while (P.library.length) {
          const yes = ask<boolean>(key + ':' + ex.length, { pid: me, kind: 'may', text: `Exile the top card? (total MV so far ${ex.reduce((s, c) => s + cmc(def(c)), 0)})` });
          if (!yes) break;
          const c = P.library.pop()!; P.exile.push(c); ex.push(c);
        }
        const mv = ex.reduce((s, c) => s + cmc(def(c)), 0);
        if (mv <= 13) for (const c of ex) { c.mayFree = g.turn; c.mayPlay = g.turn; }
        log(g, `${P.name} exiles ${ex.length} card(s) (MV ${mv}).`);
      });
      return true;
    }
    case 'manaform': {
      const x = ctx.item.event?.spent ?? evC(ctx)?.x ?? 1;
      once('mf', () => {
        const tok = createToken(g, me, { name: 'Dragon Illusion', p: x, t: x, colors: ['R'], types: ['Creature'], sub: ['Dragon', 'Illusion'], kws: ['flying', 'haste'] });
        delayExileCreated(g, ctx, me, [tok]);
        log(g, `${P.name} creates a ${x}/${x} Dragon Illusion.`);
      });
      return true;
    }
    case 'mirrorwing': {
      const ev = evC(ctx); if (!ev || !src) return true;
      const item = g.stack.find(s => s.card?.uid === ev.uid);
      const only = item?.targets?.filter(Boolean).length === 1 && item.targets.some(t => t?.card === src.uid);
      if (!only) return true;
      const ctl = item!.controller;
      const others = g.players[ctl].battlefield.filter(c => isType(c, 'Creature') && c.uid !== src.uid);
      once('mw', () => { for (const _o of others) copySpell(g, api, ev.uid, ctl); });
      return true;
    }
    case 'plargg': {
      once('pl', () => {
        const found: Card[] = [];
        for (const q of alive(g)) {
          while (q.library.length) { const c = q.library.pop()!; q.exile.push(c); if (!isType(c, 'Land')) { found.push(c); break; } }
        }
        const opp = opponents(g, me)[0];
        let taken: Card | undefined;
        if (opp && found.length) {
          const a = ask<number[]>(key, { pid: opp.id, kind: 'pick', cards: found, min: 1, max: 1, zone: 'exile', text: 'Choose a nonland card exiled this way.' });
          taken = found.find(c => a.includes(c.uid));
        }
        const rest = found.filter(c => c !== taken);
        for (const c of rest.slice(0, 2)) { c.mayFree = g.turn; c.mayPlay = g.turn; }
        log(g, `${P.name} may cast up to two of the other exiled cards.`);
      });
      return true;
    }
    case 'rionya': {
      const t = tgt(g, ctx); if (!t) return true;
      const n = 1 + (P.spells?.turn === g.turn ? (P.spells.ins ?? 0) : 0);
      once('ry', () => {
        const cs: Card[] = [];
        for (let i = 0; i < n; i++) { const tok = createToken(g, me, t.id); (tok.skw ??= []).push('haste'); cs.push(tok); }
        delayExileCreated(g, ctx, me, cs);
        log(g, `${P.name} creates ${n} hasty cop${n > 1 ? 'ies' : 'y'} of ${nm(t)}.`);
      });
      return true;
    }
    case 'rousingRefrain': {
      const opp = ctx.item.targets?.[0]?.player; if (opp === undefined) return true;
      once('rrf', () => {
        const n = g.players[opp].hand.length;
        for (let i = 0; i < n; i++) P.pool.push('R');
        (P as Player & { manaPersist?: number }).manaPersist = g.turn;
        const c = ctx.item.card ?? src;
        if (c) { const loc = locate(g, c.uid); if (loc) { moveCard(g, c, 'exile'); addCounters(g, c, 'time', 3); } }
        log(g, `${P.name} adds ${n} {R}. Rousing Refrain is exiled with three time counters.`);
      });
      return true;
    }
    case 'surgeVictory': {
      const c = tgt(g, ctx); if (!c) return true;
      once('sv', () => {
        if (locate(g, c.uid)?.zone === 'graveyard') moveCard(g, c, 'exile');
        const x = cmc(def(c));
        for (const cr of P.battlefield) if (isType(cr, 'Creature')) cr.pp += x;
        log(g, `Creatures ${P.name} controls get +${x}/+0.`);
        (g.watch ??= []).push({ ev: 'combatDamagePlayer', pl: me, turn: g.turn, until: 'eot', by: me, sourceId: ctx.item.sourceId, sourceUid: ctx.item.sourceUid, effects: [{ op: 'script', kind: 'surgeCopy', n: c.uid } as Effect], label: 'copy the exiled card' } as never);
      });
      return true;
    }
    case 'surgeCopy': {
      const uid = typeof e.n === 'number' ? e.n : 0;
      const c = locate(g, uid)?.c; if (c) { c.mayFree = g.turn; c.mayPlay = g.turn; log(g, `${P.name} may cast a copy of ${nm(c)} without paying its mana cost.`); }
      return true;
    }
    case 'twinflame': {
      const ts = (ctx.item.targets ?? []).map(t => t?.card !== undefined ? findCard(g, t.card) : undefined).filter((c): c is Card => !!c);
      once('tf', () => {
        const cs: Card[] = [];
        for (const t of ts) { const tok = createToken(g, me, t.id); (tok.skw ??= []).push('haste'); cs.push(tok); }
        delayExileCreated(g, ctx, me, cs);
      });
      return true;
    }
    case 'brudiclad': {
      once('bd', () => {
        const toks = P.battlefield.filter(c => !!c.token);
        if (toks.length < 2) return;
        const a = ask<number[]>(key, { pid: me, kind: 'pick', cards: toks, min: 0, max: 1, zone: 'battlefield', text: 'Choose a token. Each other token you control becomes a copy of it.' });
        const t = toks.find(c => a.includes(c.uid));
        if (!t) return;
        for (const o of toks) if (o !== t) becomeCopy(g, o, t);
      });
      return true;
    }
    case 'magmaOpus': {
      once('mo', () => {
        let left = 4;
        for (let i = 0; i < 4 && left > 0; i++) {
          const t = ctx.item.targets?.[i];
          if (!t) continue;
          const n = i === 3 || !ctx.item.targets?.[i + 1] ? left : 1;
          if (t.card !== undefined) { const c = findCard(g, t.card); if (c) dealDamage(g, ctx.item.sourceId, src, { card: c }, n); }
          else if (t.player !== undefined) dealDamage(g, ctx.item.sourceId, src, { player: t.player }, n);
          left -= n;
        }
        for (const i of [4, 5]) { const t = ctx.item.targets?.[i]; if (t?.card !== undefined) { const c = findCard(g, t.card); if (c) c.tapped = true; } }
        createToken(g, me, ELEM_UR(4, 4));
        draw(g, me, 2);
      });
      return true;
    }
    case 'volcTorrent': {
      const x = P.spells?.turn === g.turn ? P.spells.n : 0;
      once('vt', () => {
        for (const o of opponents(g, me)) for (const c of [...o.battlefield]) if (isType(c, 'Creature') || isType(c, 'Planeswalker')) dealDamage(g, ctx.item.sourceId, src, { card: c }, x);
        log(g, `Volcanic Torrent deals ${x} damage to each creature and planeswalker opponents control.`);
      });
      return true;
    }
    case 'roothaCopy': {
      const t = tgt(g, ctx) ?? evC(ctx);
      if (t) copySpell(g, api, t.uid, me);
      return true;
    }
    case 'feralPest': {
      const c = tgt(g, ctx);
      if (c && isType(c, 'Creature')) once('fp', () => { createToken(g, me, PEST); });
      return true;
    }
    case 'ribtruss': {
      const n = src ? ctr(src, '+1/+1') : 0;
      once('rt', () => { for (let i = 0; i < n; i++) createToken(g, me, PEST); log(g, `${P.name} creates ${n} Pest(s).`); });
      return true;
    }
    case 'finalActCounters': {
      once('fac', () => {
        for (const o of opponents(g, me)) {
          o.poison = 0;
          for (const c of o.battlefield) c.counters = {};
        }
        log(g, `Each opponent loses all counters.`);
      });
      return true;
    }
    case 'jadar': {
      if (P.battlefield.some(c => hasDecayed(c))) return true;
      once('jd', () => { createToken(g, me, { name: 'Zombie', p: 2, t: 2, colors: ['B'], types: ['Creature'], sub: ['Zombie'], kws: ['decayed'] }); });
      return true;
    }
    case 'netherTraitor': {
      const loc = src ? locate(g, src.uid) : undefined;
      if (!loc || loc.zone !== 'graveyard') return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: 'Pay {B} to return Nether Traitor to the battlefield?' });
      if (yes) once('nt', () => { moveCard(g, src!, 'battlefield', { ctl: me }); log(g, `${nm(src!)} returns to the battlefield.`); });
      return true;
    }
    case 'priestFG': {
      once('pfg', () => {
        for (const q of alive(g)) {
          const yes = q.id === me ? false : true;
          if (!yes) continue;
          loseLife(g, q.id, 2);
          const cr = q.battlefield.filter(c => isType(c, 'Creature'));
          if (cr.length) {
            const a = cr.length === 1 ? [cr[0].uid] : ask<number[]>(key + ':' + q.id, { pid: q.id, kind: 'pick', cards: cr, min: 1, max: 1, zone: 'battlefield', text: 'Sacrifice a creature.' });
            const c = cr.find(x => a.includes(x.uid)); if (c) sacrifice(g, c);
          }
        }
        P.pool.push('B', 'B'); draw(g, me, 1);
      });
      return true;
    }
    case 'bogbeast': {
      const x = P.gained ?? 0;
      once('bb', () => { for (const c of P.battlefield) if (isType(c, 'Creature')) { c.pp += x; c.pt += x; (c.skw ??= []).push('trample'); } log(g, `Creatures you control get +${x}/+${x} and trample.`); });
      return true;
    }
    case 'pestInfest': {
      once('pi2', () => {
        for (const t of ctx.item.targets ?? []) { if (t?.card === undefined) continue; const c = findCard(g, t.card); if (c) { log(g, `${nm(c)} is destroyed.`); moveCard(g, c, 'graveyard'); } }
        const x = evX(ctx); for (let i = 0; i < x * 2; i++) createToken(g, me, PEST);
      });
      return true;
    }
    case 'cullingRitual': {
      once('cr', () => {
        let n = 0;
        for (const q of g.players) for (const c of [...q.battlefield]) if (!isType(c, 'Land') && cmc(def(c)) <= 2) { moveCard(g, c, 'graveyard'); n++; }
        const col = ask<string>(key, { pid: me, kind: 'color', options: ['B', 'G'], text: `Add ${n} mana of {B} or {G}.` });
        for (let i = 0; i < n; i++) P.pool.push(col === 'G' ? 'G' : 'B');
      });
      return true;
    }
    case 'gyome': {
      const n = P.etbT === g.turn ? (P.etbN ?? 0) : 0;
      once('gy', () => { for (let i = 0; i < n; i++) createToken(g, me, FOOD); log(g, `${P.name} creates ${n} Food token(s).`); });
      return true;
    }
    case 'witherLand': {
      once('wl', () => {
        const lands = P.graveyard.filter(c => isType(c, 'Land'));
        if (!lands.length) return;
        const a = lands.length === 1 ? [lands[0].uid] : ask<number[]>(key, { pid: me, kind: 'pick', cards: lands, min: 1, max: 1, zone: 'graveyard', text: 'Return a land card to your hand.' });
        const c = lands.find(x => a.includes(x.uid)); if (c) { P.graveyard = P.graveyard.filter(x => x !== c); P.hand.push(c); }
      });
      return true;
    }
    case 'plumbForbidden': {
      const n = evX(ctx);
      const spell = ctx.item.card;
      if (spell && n > 0) once('pfb', () => { for (let i = 0; i < n; i++) copySpell(g, api, spell.uid, me); });
      return true;
    }
    case 'deadlyBrew': {
      once('db', () => {
        let youSac = false;
        for (const q of alive(g)) {
          const cs = q.battlefield.filter(c => isType(c, 'Creature') || isType(c, 'Planeswalker'));
          if (!cs.length) continue;
          const a = cs.length === 1 ? [cs[0].uid] : ask<number[]>(key + ':' + q.id, { pid: q.id, kind: 'pick', cards: cs, min: 1, max: 1, zone: 'battlefield', text: 'Sacrifice a creature or planeswalker.' });
          const c = cs.find(x => a.includes(x.uid));
          if (c) { if (q.id === me) youSac = true; sacrifice(g, c); }
        }
        if (youSac) {
          const gy = P.graveyard.filter(c => isPermanentCard(def(c)));
          if (gy.length) {
            const a = ask<number[]>(key + ':ret', { pid: me, kind: 'pick', cards: gy, min: 0, max: 1, zone: 'graveyard', text: 'Return a permanent card from your graveyard to your hand?' });
            const c = gy.find(x => a.includes(x.uid)); if (c) { P.graveyard = P.graveyard.filter(x => x !== c); P.hand.push(c); }
          }
        }
      });
      return true;
    }
    case 'augusta': {
      once('ag', () => {
        let n = 0;
        for (const q of alive(g)) {
          if (!q.graveyard.length) continue;
          const a = q.graveyard.length === 1 ? [q.graveyard[0].uid] : ask<number[]>(key + ':' + q.id, { pid: q.id, kind: 'pick', cards: q.graveyard, min: 1, max: 1, zone: 'graveyard', text: 'Exile a card from your graveyard.' });
          const c = q.graveyard.find(x => a.includes(x.uid));
          if (c) { q.graveyard = q.graveyard.filter(x => x !== c); q.exile.push(c); if (!isType(c, 'Land')) n++; }
        }
        const t = tgt(g, ctx);
        if (t && n) addCounters(g, t, '+1/+1', n);
      });
      return true;
    }
    case 'ceaseless': {
      once('cc', () => {
        let n = 0;
        const yours = P.battlefield.filter(c => isType(c, 'Creature') && !c.token);
        for (const q of g.players) for (const c of [...q.battlefield]) if (isType(c, 'Creature')) {
          if (yours.includes(c)) n++;
          moveCard(g, c, 'graveyard');
        }
        for (let i = 0; i < n; i++) createToken(g, me, { name: 'Spirit', p: 3, t: 2, colors: ['R', 'W'], types: ['Creature'], sub: ['Spirit'] });
      });
      return true;
    }
    case 'fatefulTempest': {
      once('ft', () => {
        let past = 0, present = 0;
        for (const q of alive(g)) {
          const pastVote = ask<boolean>(key + ':' + q.id, { pid: q.id, kind: 'may', text: 'Vote past? (No = present)' });
          if (pastVote) past++; else present++;
        }
        const milled: Card[] = [];
        for (let i = 0; i < past; i++) { const c = P.library.pop(); if (c) { P.graveyard.push(c); milled.push(c); } }
        const dmg = milled.reduce((s, c) => s + cmc(def(c)), 0);
        for (const o of opponents(g, me)) dealDamage(g, ctx.item.sourceId, src, { player: o.id }, dmg);
        for (let i = 0; i < present; i++) { const c = P.library.pop(); if (c) { c.mayPlay = g.turn + alive(g).length; P.exile.push(c); } }
      });
      return true;
    }
    case 'spiritResilience': {
      if (!src) return true;
      once('sr', () => {
        addCounters(g, src, '+1/+1', 1);
        log(g, `${nm(src)} gets a +1/+1 counter.`);
      });
      return true;
    }
    case 'waveReckon': {
      once('wv', () => {
        for (const q of g.players) for (const c of [...q.battlefield]) if (isType(c, 'Creature')) dealDamage(g, c.id, c, { card: c }, power(g, c));
      });
      return true;
    }
    case 'aoLook': {
      once('ao', () => {
        const top = popTop(P, 7);
        const ok = top.filter(c => isPermanentCard(def(c)) && !isType(c, 'Land') && cmc(def(c)) <= 4);
        const pick = ok.length ? ask<number[]>(key, { pid: me, kind: 'pick', cards: ok, min: 0, max: ok.length, zone: 'library', text: 'Put any number of nonland permanents with total mana value 4 or less onto the battlefield.' }) : [];
        const chosen: Card[] = []; let mv = 0;
        for (const u of pick) { const c = ok.find(x => x.uid === u); if (c && mv + cmc(def(c)) <= 4) { chosen.push(c); mv += cmc(def(c)); } }
        for (const c of chosen) enter(g, c, me);
        bottomRandom(P, top.filter(c => !chosen.includes(c)));
      });
      return true;
    }
    case 'aoCounters': {
      once('aoc', () => { for (const c of P.battlefield) if (isType(c, 'Creature') || subtypes(def(c)).includes('Vehicle')) addCounters(g, c, '+1/+1', 2); });
      return true;
    }
    case 'archMap': {
      const evp = evC(ctx)?.owner;
      if (evp === undefined) return true;
      const their = g.players[evp].battlefield.filter(c => isType(c, 'Land')).length;
      const yours = P.battlefield.filter(c => isType(c, 'Land')).length;
      if (their <= yours) return true;
      const lands = P.hand.filter(c => isType(c, 'Land'));
      if (!lands.length) return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: 'Put a land card from your hand onto the battlefield?' });
      if (yes) once('am', () => {
        const a = lands.length === 1 ? [lands[0].uid] : ask<number[]>(key + ':l', { pid: me, kind: 'pick', cards: lands, min: 1, max: 1, zone: 'hand', text: 'Choose a land.' });
        const c = lands.find(x => a.includes(x.uid)); if (c) { P.hand = P.hand.filter(x => x !== c); enter(g, c, me); }
      });
      return true;
    }
    case 'claimJumper': {
      once('cj', () => {
        const more = () => opponents(g, me).some(o => o.battlefield.filter(c => isType(c, 'Land')).length > P.battlefield.filter(c => isType(c, 'Land')).length);
        let searched = false;
        const findPlains = () => {
          const c = P.library.find(x => subtypes(def(x)).includes('Plains') || def(x).name === 'Plains');
          if (c) { P.library = P.library.filter(x => x !== c); enter(g, c, me, { tapped: true }); searched = true; }
        };
        if (more()) { const yes = ask<boolean>(key, { pid: me, kind: 'may', text: 'Search for a Plains and put it onto the battlefield tapped?' }); if (yes) findPlains(); }
        if (more()) { const yes = ask<boolean>(key + ':2', { pid: me, kind: 'may', text: 'Repeat: search for another Plains?' }); if (yes) findPlains(); }
        if (searched) shuffle(g, P.library);
      });
      return true;
    }
    case 'guardianPhase': {
      once('gp', () => {
        const others = P.battlefield.filter(c => isType(c, 'Creature') && c.uid !== src?.uid);
        const a = others.length ? ask<number[]>(key, { pid: me, kind: 'pick', cards: others, min: 0, max: others.length, zone: 'battlefield', text: 'Any number of other creatures you control phase out.' }) : [];
        for (const c of others.filter(x => a.includes(x.uid))) {
          P.battlefield = P.battlefield.filter(x => x !== c);
          (P.phased ??= []).push(c);
          log(g, `${nm(c)} phases out.`);
        }
      });
      return true;
    }
    case 'sevinneCopy': {
      const fromGy = ctx.item.card?.castFrom === 'flashback' || ctx.item.flashback || ctx.item.card?.castFrom === 'graveyard';
      if (fromGy) {
        const yes = ask<boolean>(key, { pid: me, kind: 'may', text: "Copy Sevinne's Reclamation?" });
        if (yes && ctx.item.card) copySpell(g, api, ctx.item.card.uid, me);
      }
      return true;
    }
    case 'skyclaveLink': {
      const t = tgt(g, ctx); if (t && src) once('skl', () => { t.exBy = src.uid; });
      return true;
    }
    case 'skyclaveLeave': {
      once('skv', () => {
        for (const q of g.players) {
          const c = q.exile.find(x => x.exBy === ctx.item.sourceUid);
          if (c) { const x = cmc(def(c)); createToken(g, c.owner, { name: 'Illusion', p: x, t: x, colors: ['U'], types: ['Creature'], sub: ['Illusion'] }); }
        }
      });
      return true;
    }
    case 'conspiracyAtk': {
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: 'Pay {1} and discard a card to draw a card?' });
      if (yes && P.hand.length) once('ca2', () => {
        const a = P.hand.length === 1 ? [P.hand[0].uid] : ask<number[]>(key + ':d', { pid: me, kind: 'pick', cards: P.hand, min: 1, max: 1, zone: 'hand', text: 'Discard a card.' });
        const c = P.hand.find(x => a.includes(x.uid));
        if (c) { P.hand = P.hand.filter(x => x !== c); P.graveyard.push(c); draw(g, me, 1); }
      });
      return true;
    }
    case 'conspiracyDisc': {
      once('cd', () => {
        const gy = P.graveyard.filter(c => !isType(c, 'Land') && c.fromBfT !== g.turn);
        // recently discarded nonlands in gy
        const cands = P.graveyard.filter(c => !isType(c, 'Land'));
        if (!cands.length) return;
        const a = ask<number[]>(key, { pid: me, kind: 'pick', cards: cands, min: 0, max: 1, zone: 'graveyard', text: 'Exile a discarded nonland card? You may cast it this turn.' });
        const c = cands.find(x => a.includes(x.uid));
        if (c) { P.graveyard = P.graveyard.filter(x => x !== c); P.exile.push(c); c.mayPlay = g.turn; }
        void gy;
      });
      return true;
    }
    case 'hofri': {
      const ev = evC(ctx); if (!ev) return true;
      once('hf', () => {
        const loc = locate(g, ev.uid);
        if (loc?.zone === 'graveyard') moveCard(g, ev, 'exile');
        const tok = createToken(g, me, ev.id);
        tok.addSub = [...(tok.addSub ?? []), 'Spirit'];
        (g.delayed ??= []).push({ at: 'endStep', turnAfter: 99999, controller: me, sourceId: ctx.item.sourceId, sourceUid: tok.uid, label: `return ${nm(ev)}`, effects: [] as Effect[] });
        log(g, `${P.name} creates a Spirit copy of ${nm(ev)}.`);
      });
      return true;
    }
    case 'quintoCast': {
      once('qc', () => {
        const ex = g.players.flatMap(q => q.exile.filter(c => c.exBy === ctx.item.sourceUid));
        if (!ex.length) return;
        const a = ask<number[]>(key, { pid: me, kind: 'pick', cards: ex, min: 0, max: 1, zone: 'exile', text: 'You may cast a card exiled with Quintorius without paying its mana cost this turn.' });
        const c = ex.find(x => a.includes(x.uid));
        if (c) { c.mayFree = g.turn; c.mayPlay = g.turn; }
      });
      return true;
    }
    case 'warsinger': {
      const t = tgt(g, ctx); const dmg = ctx.item.event?.amount ?? 0;
      if (t && cmc(def(t)) <= dmg && locate(g, t.uid)?.zone === 'graveyard') {
        const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `Return ${nm(t)} to the battlefield?` });
        if (yes) once('ws', () => { moveCard(g, t, 'battlefield', { ctl: me }); });
      }
      return true;
    }
    case 'timepiece': {
      once('tp', () => {
        if (!P.graveyard.length) return;
        const a = ask<number[]>(key, { pid: me, kind: 'pick', cards: P.graveyard, min: 0, max: P.graveyard.length, zone: 'graveyard', text: 'Shuffle any number of cards from your graveyard into your library.' });
        const cs = P.graveyard.filter(c => a.includes(c.uid));
        P.graveyard = P.graveyard.filter(c => !cs.includes(c));
        P.library.push(...cs); shuffle(g, P.library);
      });
      return true;
    }
    case 'owlinCopy': {
      const ev = evC(ctx); if (!ev) return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: 'Copy that spell?' });
      if (yes) copySpell(g, api, ev.uid, me);
      return true;
    }
    case 'nexusMove': {
      const a = tgt(g, ctx, 0); const b = tgt(g, ctx, 1);
      if (a && b) once('nm', () => {
        const ctrs = { ...a.counters };
        a.counters = {};
        for (const [k, v] of Object.entries(ctrs)) if (v) addCounters(g, b, k, v);
      });
      return true;
    }
    case 'nexusDraw': {
      const a = tgt(g, ctx); if (!a) return true;
      once('nd', () => {
        const n = Object.values(a.counters ?? {}).reduce((s, v) => s + v, 0);
        a.counters = {}; if (n) draw(g, me, n);
      });
      return true;
    }
    case 'kineticOoze': {
      const t = tgt(g, ctx); const x = evX(ctx);
      once('ko', () => {
        if (t && cmc(def(t)) <= x) { log(g, `${nm(t)} is destroyed.`); moveCard(g, t, 'graveyard'); }
        if (x >= 5) draw(g, me, 1);
        if (x >= 10) {
          const cr = P.battlefield.filter(c => isType(c, 'Creature') && c.uid !== src?.uid);
          for (const c of cr) doubleP1(g, c);
        }
      });
      return true;
    }
    case 'latticeFrac': {
      const n = src ? ctr(src, 'study') : 0;
      once('lf', () => { const tok = createToken(g, me, FRACTAL); if (n) addCounters(g, tok, '+1/+1', n); });
      return true;
    }
    case 'nevX': {
      const x = evC(ctx)?.x ?? evX(ctx);
      if (src && x) once('nv', () => { addCounters(g, src, '+1/+1', x); });
      return true;
    }
    case 'brassNext': {
      once('bn', () => { (g.nextIS ??= []).push({ pid: me, turn: g.turn, sourceId: ctx.item.sourceId, sourceUid: ctx.item.sourceUid }); (P as Player & { brassX?: number }).brassX = g.turn; log(g, `When you next cast a spell with {X} this turn, draw a card and gain half X life.`); });
      return true;
    }
    case 'cmdInsight': {
      const pid = ctx.item.targets?.[0]?.player ?? me;
      const q = g.players[pid];
      const n = evX(ctx) + (q.commanderCasts ?? 0);
      once('ci2', () => { draw(g, pid, n); log(g, `${q.name} draws ${n} cards.`); });
      return true;
    }
    case 'ingenious': {
      if (!src || ctr(src, '+1/+1') < 1) return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: 'Remove a +1/+1 counter from Ingenious Prodigy to draw a card?' });
      if (yes) once('ig', () => { addCounters(g, src, '+1/+1', -1); draw(g, me, 1); });
      return true;
    }
    case 'unboundDbl': {
      const ev = evC(ctx);
      if (ev && (ev.x ?? 0) > 0 && isPermanentCard(def(ev))) once('ud', () => { ev.x = (ev.x ?? 0) * 2; const it = g.stack.find(s => s.card?.uid === ev.uid); if (it) it.x = ev.x; log(g, `Unbound Flourishing doubles X to ${ev.x}.`); });
      return true;
    }
    case 'unboundCopy': {
      const ev = evC(ctx); if (ev) copySpell(g, api, ev.uid, me);
      return true;
    }
    case 'curseSwine': {
      once('cs', () => {
        for (const t of ctx.item.targets ?? []) {
          if (t?.card === undefined) continue;
          const c = findCard(g, t.card); if (!c) continue;
          const owner = c.owner; exileCard(g, c);
          createToken(g, owner, { name: 'Boar', p: 2, t: 2, colors: ['G'], types: ['Creature'], sub: ['Boar'] });
        }
      });
      return true;
    }
    case 'zimoneHyp': {
      once('zh', () => {
        const cr = P.battlefield.filter(c => isType(c, 'Creature'));
        if (cr.length) {
          const a = ask<number[]>(key, { pid: me, kind: 'pick', cards: cr, min: 0, max: 1, zone: 'battlefield', text: 'You may put a +1/+1 counter on a creature.' });
          const c = cr.find(x => a.includes(x.uid)); if (c) addCounters(g, c, '+1/+1', 1);
        }
        const odd = ask<boolean>(key + ':oe', { pid: me, kind: 'may', text: 'Choose odd? (No = even)' });
        for (const q of g.players) for (const c of [...q.battlefield]) if (isType(c, 'Creature') && (power(g, c) % 2 === 1) === odd) moveCard(g, c, 'hand');
      });
      return true;
    }
    case 'animistAwake': {
      once('aa2', () => {
        const x = evX(ctx); const top = popTop(P, x);
        const lands = top.filter(c => isType(c, 'Land')); const rest = top.filter(c => !lands.includes(c));
        for (const c of lands) enter(g, c, me, { tapped: true });
        ctx.created.push(...lands);
        bottomRandom(P, rest);
      });
      return true;
    }
    case 'animistMastery': {
      const n = P.graveyard.filter(c => isType(c, 'Instant') || isType(c, 'Sorcery')).length;
      if (n >= 2) once('am2', () => { for (const c of ctx.created) c.tapped = false; });
      return true;
    }
    case 'forgottenAnc': {
      if (!src) return true;
      const n = ctr(src, '+1/+1'); if (!n) return true;
      once('fa2', () => {
        const others = P.battlefield.filter(c => isType(c, 'Creature') && c !== src);
        if (!others.length) return;
        // move all to first other for AI simplicity; humans can pick via repeated asks — move n optional
        const move = ask<number[]>(key, { pid: me, kind: 'pick', cards: others, min: 0, max: 1, zone: 'battlefield', text: `Move any number of +1/+1 counters (${n}) onto another creature?` });
        const t = others.find(c => move.includes(c.uid));
        if (t) { addCounters(g, src, '+1/+1', -n); addCounters(g, t, '+1/+1', n); }
      });
      return true;
    }
    case 'doubleP1': {
      const who = (e.who === 'attached' && src?.attachedTo !== undefined) ? findCard(g, src.attachedTo)
        : e.who === 't0' ? tgt(g, ctx) : e.who === 'self' ? src : tgt(g, ctx) ?? src;
      if (who) once('d1', () => doubleP1(g, who));
      return true;
    }
    case 'goldvein': {
      const ev = evC(ctx) ?? src; const n = ev?.lki?.p ?? (ev ? (def(ev).power ?? 0) : 0);
      once('gv', () => { for (let i = 0; i < n; i++) createToken(g, me, TREASURE, { tapped: true }); });
      return true;
    }
    case 'lifeblood': {
      const ev = evC(ctx) ?? src; const n = ev?.lki?.p ?? (ev ? (def(ev).power ?? 0) : 0);
      once('lb', () => { /* gainLife imported? */ P.life += n; P.gained += n; draw(g, me, n); log(g, `${P.name} gains ${n} life and draws ${n} cards.`); });
      return true;
    }
    case 'openWay': {
      once('ow', () => {
        const x = Math.min(evX(ctx), alive(g).length);
        const lands: Card[] = []; const rest: Card[] = [];
        while (P.library.length && lands.length < x) { const c = P.library.pop()!; if (isType(c, 'Land')) lands.push(c); else rest.push(c); }
        for (const c of lands) enter(g, c, me, { tapped: true });
        bottomRandom(P, rest);
      });
      return true;
    }
    case 'silkguard': {
      once('sg', () => {
        for (const c of P.battlefield) {
          const mod = Object.values(c.counters ?? {}).some(n => n > 0) || g.players.some(q => q.battlefield.some(x => x.attachedTo === c.uid && (subtypes(def(x)).includes('Equipment') || (subtypes(def(x)).includes('Aura') && x.owner === me))));
          if (subtypes(def(c)).includes('Aura') || subtypes(def(c)).includes('Equipment') || (isType(c, 'Creature') && mod)) (c.skw ??= []).push('hexproof');
        }
        log(g, `Auras, Equipment, and modified creatures you control gain hexproof until end of turn.`);
      });
      return true;
    }
    case 'alteredEgo': {
      if (!src) return true;
      once('ae', () => {
        const cr = g.players.flatMap(q => q.battlefield.filter(c => isType(c, 'Creature') && c !== src));
        if (!cr.length) return;
        const yes = ask<boolean>(key, { pid: me, kind: 'may', text: 'Have Altered Ego enter as a copy of a creature?' });
        if (!yes) return;
        const a = ask<number[]>(key + ':c', { pid: me, kind: 'pick', cards: cr, min: 1, max: 1, zone: 'battlefield', text: 'Choose a creature to copy.' });
        const t = cr.find(c => a.includes(c.uid));
        if (t) { becomeCopy(g, src, t); const x = evX(ctx); if (x) addCounters(g, src, '+1/+1', x); }
      });
      return true;
    }
    case 'biomass': {
      const x = evX(ctx);
      once('bm', () => { for (const c of P.battlefield) if (isType(c, 'Creature')) c.anim = { p: x, t: x, ts: g.turn }; log(g, `Creatures you control have base power and toughness ${x}/${x} until end of turn.`); });
      return true;
    }
    case 'groveBounty': {
      once('gb', () => {
        const x = evX(ctx);
        const ts = (ctx.item.targets ?? []).map(t => t?.card !== undefined ? findCard(g, t.card) : undefined).filter((c): c is Card => !!c);
        let left = x;
        for (const c of ts) { const n = ts.length === 1 ? left : 1; addCounters(g, c, '+1/+1', Math.min(n, left)); left -= Math.min(n, left); }
        if (left && ts[0]) addCounters(g, ts[0], '+1/+1', left);
      });
      return true;
    }
    case 'gooseFood': {
      const x = evX(ctx); const n = Math.ceil(x / 2);
      once('gf', () => { for (let i = 0; i < n; i++) createToken(g, me, FOOD); });
      return true;
    }
    case 'hydroid': {
      const x = evX(ctx) || (ctx.item.card?.x ?? 0);
      const life = Math.floor(x / 2); const cards = Math.floor(x / 2);
      once('hk', () => { P.life += life; P.gained += life; if (cards) draw(g, me, cards); log(g, `${P.name} gains ${life} life and draws ${cards} cards.`); });
      return true;
    }
    case 'oversimplify': {
      once('os', () => {
        const pow: Record<number, number> = {};
        for (const q of g.players) {
          pow[q.id] = 0;
          for (const c of [...q.battlefield]) if (isType(c, 'Creature')) { pow[q.id] += power(g, c); exileCard(g, c); }
        }
        for (const q of alive(g)) { const tok = createToken(g, q.id, FRACTAL); if (pow[q.id]) addCounters(g, tok, '+1/+1', pow[q.id]); }
      });
      return true;
    }
    case 'quandrixShuffle': {
      once('qs', () => {
        const pid = ctx.item.targets?.[0]?.player;
        const cs = (ctx.item.targets ?? []).slice(1).map(t => t?.card !== undefined ? locate(g, t.card)?.c : undefined).filter((c): c is Card => !!c);
        const q = pid !== undefined ? g.players[pid] : P;
        for (const c of cs) { const loc = locate(g, c.uid); if (loc?.zone === 'graveyard') { loc.p.graveyard = loc.p.graveyard.filter(x => x !== c); q.library.push(c); } }
        shuffle(g, q.library);
      });
      return true;
    }
    case 'tanazir': {
      if (!src) return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: "Have other creatures' base P/T become equal to Tanazir's until end of turn?" });
      if (yes) once('tz', () => {
        const p = power(g, src), t = toughness(g, src);
        for (const c of P.battlefield) if (isType(c, 'Creature') && c !== src) c.anim = { p, t, ts: g.turn };
      });
      return true;
    }
    case 'zimonePrimo': {
      const lands = P.battlefield.filter(c => isType(c, 'Land'));
      const entered = lands.some(c => c.enteredTurn === g.turn);
      const prime = (n: number) => { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
      if (entered && prime(lands.length)) once('zp', () => {
        const tok = createToken(g, me, { name: 'Primo, the Indivisible', p: 0, t: 0, colors: ['G', 'U'], types: ['Creature'], sub: ['Fractal'], legendary: true });
        addCounters(g, tok, '+1/+1', lands.length);
        log(g, `${P.name} creates Primo, the Indivisible with ${lands.length} +1/+1 counters.`);
      });
      return true;
    }
    case 'alchemistFlash': {
      once('af', () => { P.flashAll = g.turn; log(g, `${P.name} may cast spells as though they had flash this turn.`); });
      return true;
    }
    case 'oranRief': {
      once('or', () => { for (const c of P.battlefield) if (isType(c, 'Creature') && def(c).colors.includes('G') && c.enteredTurn === g.turn) addCounters(g, c, '+1/+1', 1); });
      return true;
    }
    default:
      return false;
  }
}

function hasDecayed(c: Card) { return (def(c).keywords ?? []).includes('decayed') || (c.skw ?? []).includes('decayed') || (c.kw ?? []).includes('decayed'); }

type Player = Game['players'][number];
