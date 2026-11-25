/** Exact resolution for Secrets of Strixhaven Commander cards the generic compiler can't express. Replay-safe. */
import type { Card, CardDef, Effect, Game, TokenSpec } from './engine';
import {
  addCounters, becomeCopy, CARDS, createToken, def, draw, findCard, isPermanentCard, isType, locate, log, loseLife, moveCard,
  pay, planPayment, power, sacrifice,
} from './engine';
import type { FrcApi } from './frc';

const nm = (c: { id: string }) => def(c).name;
const srcCard = (g: Game, ctx: FrcApi['ctx']) => findCard(g, ctx.item.sourceUid);
const copyStackSpell = (g: Game, ctx: FrcApi['ctx'], api: FrcApi, uid: number, ctl: number) => {
  const orig = g.stack.find(s => s.kind === 'spell' && s.card?.uid === uid);
  if (!orig?.card) return;
  api.once(`copy:${ctl}:${uid}:${g.stack.length}`, () => {
    const card: Card = { ...orig.card!, uid: g.nextUid++, isCopy: true, token: isPermanentCard(def(orig.card!)) ? true : orig.card!.token };
    g.stack.push({ ...orig, id: g.nextUid++, controller: ctl, card, label: `copy of ${orig.label}` });
    log(g, `${g.players[ctl].name} copies ${nm(orig.card!)}.`);
  });
};

export function runSoc(kind: string | undefined, api: FrcApi): boolean {
  if (!kind) return false;
  const { g, ctx, e, key, me, P, srcName, once, ask } = api;
  const src = srcCard(g, ctx);

  switch (kind) {
    case 'demonstrate': {
      const spell = ctx.item.evCard ?? ctx.item.card ?? src;
      if (!spell) return true;
      const yes = ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: copy this spell? (Demonstrate)` });
      if (yes) {
        copyStackSpell(g, ctx, api, spell.uid, me);
        const opp = g.players.find(q => q.id !== me && !q.lost);
        if (opp) {
          const oy = ask<boolean>(key + ':opp', { pid: opp.id, kind: 'may', text: `${srcName}: copy that spell? (Demonstrate)` });
          if (oy) copyStackSpell(g, ctx, api, spell.uid, opp.id);
        }
      }
      return true;
    }
    case 'annihilator': {
      const n = (typeof e.n === 'number' ? e.n : 1);
      const defId = ctx.item.event?.player;
      if (defId === undefined) return true;
      const q = g.players[defId];
      const cands = [...q.battlefield];
      const m = Math.min(n, cands.length);
      if (!m) return true;
      const pick = m === cands.length ? cands : (() => {
        const a = ask<number[]>(key, { pid: defId, kind: 'pick', cards: cands, min: m, max: m, zone: 'battlefield', text: `Annihilator ${n}: sacrifice ${m} permanent${m > 1 ? 's' : ''}.` });
        return a.map(u => cands.find(c => c.uid === u)).filter((c): c is Card => !!c).slice(0, m);
      })();
      once('ann', () => { for (const c of pick) { log(g, `${q.name} sacrifices ${nm(c)} (annihilator).`); sacrifice(g, c); } });
      return true;
    }
    case 'myriad': {
      if (!src || src.attacking === undefined) return true;
      const others = g.players.filter(o => o.id !== me && !o.lost && o.id !== src.attacking);
      once('myriad', () => {
        const base = CARDS[src.origId ?? src.id] ?? def(src);
        for (const o of others) {
          const d: CardDef = { ...base, id: `${base.id}#myriad${g.nextUid}`, legendary: false };
          CARDS[d.id] = d;
          const tok = createToken(g, me, d.id, { tapped: true, attackingLike: { ...src, attacking: o.id } as Card });
          tok.attacking = o.id; tok.atkT = g.turn; tok.blockedBy = [];
          log(g, `Myriad: a token copy of ${nm(src)} attacks ${o.name}.`);
          (g.delayed ??= []).push({ at: 'endCombat', turnAfter: g.turn - 1, controller: me, sourceId: ctx.item.sourceId, sourceUid: ctx.item.sourceUid, label: `exile ${nm(tok)} (myriad)`, effects: [{ op: 'exile', who: `uid:${tok.uid}` } as Effect] });
        }
      });
      return true;
    }
    case 'gravestorm': {
      const n = g.gyPermT === g.turn ? (g.gyPerm ?? 0) : 0;
      const spell = ctx.item.evCard ?? ctx.item.card ?? src;
      if (!spell || n <= 0) return true;
      once('gs', () => { for (let i = 0; i < n; i++) copyStackSpell(g, ctx, api, spell.uid, me); });
      return true;
    }
    case 'echo': {
      const cost = src ? def(src).echo : undefined;
      if (!src || !cost) return true;
      const can = !!planPayment(P, cost);
      const payIt = can && ask<boolean>(key, { pid: me, kind: 'may', text: `${srcName}: pay its echo cost? If you don't, sacrifice it.` });
      once('echo', () => {
        if (payIt && pay(g, P, cost)) log(g, `${P.name} pays the echo cost of ${nm(src)}.`);
        else { log(g, `${P.name} doesn't pay echo and sacrifices ${nm(src)}.`); sacrifice(g, src); }
      });
      return true;
    }
    case 'populate': {
      const toks = P.battlefield.filter(c => c.token && isType(c, 'Creature'));
      if (!toks.length) return true;
      const a = toks.length === 1 ? [toks[0].uid] : ask<number[]>(key, { pid: me, kind: 'pick', cards: toks, min: 1, max: 1, zone: 'battlefield', text: `${srcName}: populate — choose a creature token to copy.` });
      const t = toks.find(c => c.uid === a[0]);
      if (!t) return true;
      once('pop', () => {
        const base = CARDS[t.origId ?? t.id] ?? def(t);
        const d: CardDef = { ...base, id: `${base.id}#pop${g.nextUid}` };
        CARDS[d.id] = d;
        createToken(g, me, d.id);
        log(g, `${P.name} populates ${nm(t)}.`);
      });
      return true;
    }
    case 'channel': {
      once('ch', () => { P.channel = g.turn; log(g, `${P.name} may pay 1 life to add {C} any time they could activate a mana ability this turn.`); });
      return true;
    }
    case 'prepIfPow': {
      const t = ctx.item.targets?.[0]?.card !== undefined ? findCard(g, ctx.item.targets[0].card!) : undefined;
      const need = typeof e.n === 'number' ? e.n : 7;
      if (t && src && power(g, t) >= need) { src.prepared = true; log(g, `${nm(src)} becomes prepared.`); }
      return true;
    }
    case 'advReconMain': {
      once('mill', () => {
        const cs = P.library.splice(Math.max(0, P.library.length - 1), 1);
        P.graveyard.push(...cs);
        if (cs.length) log(g, `${P.name} mills ${nm(cs[0])}.`);
      });
      if (!P.graveyard.length) return true;
      once('ex', () => {
        const i = Math.floor(((g.seed = (g.seed * 1103515245 + 12345) >>> 0) / 0x100000000) * P.graveyard.length);
        const c = P.graveyard[i];
        moveCard(g, c, 'exile');
        c.mayPlay = me; c.playBy = me;
        log(g, `${P.name} exiles ${nm(c)} at random. They may play it this turn.`);
      });
      return true;
    }
    case 'killianDraw': {
      const atk = g.players.flatMap(q => q.battlefield.filter(c => c.attacking !== undefined));
      const hit = atk.some(c => g.players.some(q => q.battlefield.some(a => a.attachedTo === c.uid && isType(a, 'Enchantment') && (def(a).sub ?? []).includes('Aura') && a.owner === me)));
      if (hit) once('kd', () => { draw(g, me, 1); });
      return true;
    }
    case 'scrivContract': {
      const host = ctx.item.targets?.[0]?.card !== undefined ? findCard(g, ctx.item.targets[0].card!) : undefined;
      if (!host) return true;
      once('sc', () => {
        const tok = createToken(g, me, { name: 'Contract', colors: ['W'], types: ['Enchantment'], sub: ['Aura'], ext: { text: 'Whenever enchanted creature attacks, it gets +2/+0 until end of turn if it\'s attacking one of your opponents. Otherwise, its controller loses 2 life.', triggers: [{ on: 'x', ev: 'attacks', subj: 'attached', label: 'Contract', effects: [{ op: 'script', kind: 'contractAtk' }] }] } });
        tok.attachedTo = host.uid;
        log(g, `${P.name} creates Contract attached to ${nm(host)}.`);
      });
      return true;
    }
    case 'contractAtk': {
      const aura = src;
      const cr = aura?.attachedTo !== undefined ? findCard(g, aura.attachedTo) : undefined;
      if (!cr || cr.attacking === undefined) return true;
      const vsOpp = cr.attacking !== cr.owner && cr.attacking !== me;
      once('ca', () => {
        if (vsOpp) { cr.pp += 2; log(g, `${nm(cr)} gets +2/+0 until end of turn.`); }
        else { loseLife(g, cr.owner, 2); log(g, `${g.players[cr.owner].name} loses 2 life.`); }
      });
      return true;
    }
    case 'roothaElem': {
      const x = P.isMaxMv ?? 0;
      if (x <= 0) return true;
      once('re', () => { createToken(g, me, { name: 'Elemental', p: x, t: x, colors: ['U', 'R'], types: ['Creature'], sub: ['Elemental'], kws: ['flying', 'haste'] }); log(g, `${P.name} creates a ${x}/${x} Elemental.`); });
      return true;
    }
    case 'muddleCopy': {
      const t = ctx.item.targets?.[0]?.card !== undefined ? findCard(g, ctx.item.targets[0].card!) : undefined;
      if (!t || !src) return true;
      once('mc', () => {
        becomeCopy(g, src, t, { eot: true });
        (src.kw ??= []); if (!src.kw.includes('myriad')) src.kw.push('myriad');
        // Myriad as a granted keyword this turn: add a one-shot attack trigger via delayed if it attacks.
        log(g, `${nm(src)} becomes a copy of ${nm(t)} until end of turn and has myriad.`);
      });
      return true;
    }
    case 'excavaReturn': {
      const t = ctx.item.targets?.[0]?.card !== undefined ? locate(g, ctx.item.targets[0].card!) : undefined;
      if (!t || t.zone !== 'graveyard') return true;
      // skip Auras
      if ((def(t.c).sub ?? []).includes('Aura') && isType(t.c, 'Enchantment') && !isType(t.c, 'Creature') && !isType(t.c, 'Artifact')) return true;
      once('exr', () => {
        moveCard(g, t.c, 'battlefield', { ctl: me });
        addCounters(g, t.c, 'finality', 1);
        t.c.addSub = [...(t.c.addSub ?? []), 'Spirit'];
        t.c.anim = { p: 1, t: 1, kw: ['flying'], perm: true, ts: t.c.ts };
        log(g, `${nm(t.c)} returns as a 1/1 Spirit with flying and a finality counter.`);
      });
      return true;
    }
    case 'primoFractal': {
      // event amount is damage; only count base-power-0 creatures you control in this batch
      const n = ctx.item.event?.amount ?? 0;
      if (n <= 0) return true;
      once('pf', () => {
        const tok = createToken(g, me, { name: 'Fractal', p: 0, t: 0, colors: ['G', 'U'], types: ['Creature'], sub: ['Fractal'] });
        addCounters(g, tok, '+1/+1', n);
        log(g, `${P.name} creates a Fractal with ${n} +1/+1 counter(s).`);
      });
      return true;
    }
    case 'chirographyP1': {
      if ((src?.classLvl ?? 1) < 2) return true;
      const t = ctx.item.targets?.[0]?.card !== undefined ? findCard(g, ctx.item.targets[0].card!) : undefined;
      if (t) once('c1', () => { addCounters(g, t, '+1/+1', 1); log(g, `${nm(t)} gets a +1/+1 counter.`); });
      return true;
    }
    case 'chirographyInk': {
      if ((src?.classLvl ?? 1) < 3) return true;
      once('c3', () => { createToken(g, me, { name: 'Inkling', p: 2, t: 1, colors: ['W', 'B'], types: ['Creature'], sub: ['Inkling'], kws: ['flying'] }); log(g, `${P.name} creates an Inkling.`); });
      return true;
    }
    default:
      return false;
  }
}

export const INKLING: TokenSpec = { name: 'Inkling', p: 2, t: 1, colors: ['W', 'B'], types: ['Creature'], sub: ['Inkling'], kws: ['flying'] };
export const SPIRIT_RW: TokenSpec = { name: 'Spirit', p: 3, t: 2, colors: ['R', 'W'], types: ['Creature'], sub: ['Spirit'] };
export const FRACTAL: TokenSpec = { name: 'Fractal', p: 0, t: 0, colors: ['G', 'U'], types: ['Creature'], sub: ['Fractal'] };
export const ELEMENTAL_UR = (x: number): TokenSpec => ({ name: 'Elemental', p: x, t: x, colors: ['U', 'R'], types: ['Creature'], sub: ['Elemental'], kws: ['flying', 'haste'] });
