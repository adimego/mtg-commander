/** Replacement-effect application (CR 614 / 616). */
import type { CardDef, Filter, Replacement, ReplEv, TokenSpec } from './types';
import type { Card, Game } from './engine';
import { condOk, ctl, def, findCard, hasPStatic, isType, liveSources, log, matches, nm } from './engine';

export interface ReplEvt {
  ev: ReplEv;
  n: number;
  combat?: boolean;
  card?: Card;
  player?: number;
  src?: Card;
  srcId?: string;
  from?: string;
  ctrKind?: string;
  /** Who is putting the counters (addCounters `by`). */
  by?: number;
  tokenSpec?: TokenSpec | string;
  creature?: boolean;
  extraTokens?: (TokenSpec | string)[];
  to?: { card?: Card; player?: number };
  cancelled?: boolean;
  /** After a replacement that changes the event kind (gain life → draw). */
  became?: ReplEv;
  dest?: 'graveyard' | 'exile' | 'library';
  /** First card drawn in this player's draw step this turn. */
  firstDrawStep?: boolean;
}

export interface ReplInst {
  id: string;
  r: Replacement;
  src: Card | undefined;
  ctl: number;
  synthetic?: boolean;
  label: string;
}

let _id = 0;

export function applyReplacements(g: Game, ev: ReplEvt): ReplEvt {
  const applied = new Set<string>();
  ev = { ...ev, extraTokens: ev.extraTokens ? [...ev.extraTokens] : [] };
  let guard = 0;
  while (guard++ < 24) {
    const cands = collect(g, ev).filter(c => !applied.has(c.id) && instApplies(g, ev, c));
    if (!cands.length) break;
    const bucket = bucket616(cands);
    const chosen = pickRepl(g, ev, bucket);
    applied.add(chosen.id);
    ev = applyOne(g, ev, chosen);
    if (ev.cancelled) break;
  }
  return ev;
}

function collect(g: Game, ev: ReplEvt): ReplInst[] {
  const out: ReplInst[] = [];
  for (const src of liveSources(g)) {
    const rs = def(src).replacements ?? [];
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      out.push({ id: `p:${src.uid}:${i}`, r, src, ctl: ctl(src), label: r.text ?? def(src).name });
    }
    // Synthesize replacements from existing statics so 616 can order them with new ones.
    for (const st of def(src).statics ?? []) {
      if (ev.ev === 'token') {
        if (st.k === 'tokenDouble' && ctl(src) === ev.player)
          out.push({ id: `s:${src.uid}:td`, r: { ev: 'token', instead: { k: 'mul', n: 2 } }, src, ctl: ctl(src), synthetic: true, label: `${nm(src)} (double tokens)` });
        if (st.k === 'tokenTriple' && ev.creature && ctl(src) === ev.player)
          out.push({ id: `s:${src.uid}:tt`, r: { ev: 'token', instead: { k: 'mul', n: 3 } }, src, ctl: ctl(src), synthetic: true, label: `${nm(src)} (triple tokens)` });
      }
      if (ev.ev === 'counters') {
        if (st.k === 'plusP1P1' && ev.ctrKind === '+1/+1' && ev.card && ev.n > 0 && matches(g, ev.card, st.f, ctl(src), src.uid))
          out.push({ id: `s:${src.uid}:p11`, r: { ev: 'counters', instead: { k: 'plusCount', n: 1 }, ctrKind: '+1/+1' }, src, ctl: ctl(src), synthetic: true, label: `${nm(src)} (plus one +1/+1)` });
        if (st.k === 'plusCharge' && ev.ctrKind === 'charge' && ev.card && ev.n > 0 && isType(ev.card, 'Artifact') && ctl(ev.card) === ctl(src))
          out.push({ id: `s:${src.uid}:pch`, r: { ev: 'counters', instead: { k: 'plusCount', n: 1 }, ctrKind: 'charge' }, src, ctl: ctl(src), synthetic: true, label: `${nm(src)} (plus one charge)` });
      }
      if (ev.ev === 'gainLife' && st.k === 'doubleLife' && ev.player === ctl(src))
        out.push({ id: `s:${src.uid}:dl`, r: { ev: 'gainLife', instead: { k: 'mul', n: 2 } }, src, ctl: ctl(src), synthetic: true, label: `${nm(src)} (double life)` });
      if (ev.ev === 'draw' && st.k === 'doubleDraw' && ev.player === ctl(src) && !ev.firstDrawStep)
        out.push({ id: `s:${src.uid}:dd`, r: { ev: 'draw', instead: { k: 'mul', n: 2 } }, src, ctl: ctl(src), synthetic: true, label: `${nm(src)} (double draw)` });
    }
  }
  if (ev.ev === 'token' && ev.player !== undefined && g.players[ev.player].tokDouble === g.turn)
    out.push({ id: `g:${ev.player}:tokd:${g.turn}`, r: { ev: 'token', instead: { k: 'mul', n: 2 } }, src: undefined, ctl: ev.player, synthetic: true, label: 'token doubling (this turn)' });
  for (const t of g.tempRepls ?? []) {
    if (t.until === 'eot' && t.turn !== g.turn) continue;
    out.push({ id: `t:${t.id}`, r: t.r, src: t.srcUid !== undefined ? findCard(g, t.srcUid) : undefined, ctl: t.by, label: t.r.text ?? 'replacement' });
  }
  return out;
}

function instApplies(g: Game, ev: ReplEvt, inst: ReplInst): boolean {
  const r = inst.r;
  if ((ev.ev === 'die' || ev.ev === 'toGy') && ev.dest && ev.dest !== 'graveyard') return false;
  if (r.ev !== ev.ev) {
    // "would die" and "would be put into a graveyard from the battlefield" share an event when a creature/pw dies.
    if (!((ev.ev === 'die' && r.ev === 'toGy') || (ev.ev === 'toGy' && r.ev === 'die' && ev.from === 'battlefield'))) return false;
  }
  if (r.combat === true && !ev.combat) return false;
  if (r.combat === false && ev.combat) return false;
  if (r.thisTurn && ev.ev !== 'die' && ev.ev !== 'toGy' && ev.ev !== 'damage') {
    /* thisTurn on die/toGy is encoded on the replacement itself (installed for the turn) */
  }
  const me = inst.ctl;
  if (r.pl) {
    const pid = ev.player ?? (ev.card ? ev.card.owner : undefined);
    if (pid === undefined) return false;
    if (r.pl === 'you' && pid !== me) return false;
    if (r.pl === 'opp' && (pid === me || g.players[pid]?.lost)) return false;
  }
  if (r.f && ev.card && !matches(g, ev.card, r.f, me, inst.src?.uid)) return false;
  if (r.f && !ev.card && ev.ev !== 'damage' && ev.ev !== 'draw' && ev.ev !== 'gainLife' && ev.ev !== 'loseLife' && ev.ev !== 'token' && ev.ev !== 'extraTurn') return false;
  // toGy / die subject filter: if f is set and we have a card, already checked. If f is set and no card, no.
  if ((ev.ev === 'die' || ev.ev === 'toGy') && r.f && !ev.card) return false;
  if (r.cardsOnly && ev.card?.token) return false;
  if (r.fromAnywhere === false && ev.from && ev.from !== 'battlefield') return false;
  if (r.ev === 'die' && ev.ev === 'toGy' && ev.from !== 'battlefield') return false;
  if (r.ev === 'die' && ev.card && ev.from === 'battlefield') {
    // "would die" only for creatures, planeswalkers, and battles.
    if (!isType(ev.card, 'Creature') && !isType(ev.card, 'Planeswalker') && !isType(ev.card, 'Battle')) return false;
  }
  if (r.srcYou && (!ev.src || ctl(ev.src) !== me)) return false;
  if (r.srcOther && ev.src && inst.src && ev.src.uid === inst.src.uid) return false;
  if (r.colors?.length) {
    const srcDef: CardDef | undefined = ev.src ? def(ev.src) : ev.srcId ? undefined : undefined;
    const cols = ev.src ? def(ev.src).colors : [];
    if (!r.colors.some(c => cols.includes(c))) return false;
  }
  if (r.srcF && ev.src && !matches(g, ev.src, r.srcF, me, inst.src?.uid)) return false;
  if (r.srcF && !ev.src) return false;
  if (r.thisWay || r.bySrc) {
    if (!ev.card || !inst.src) return false;
    if ((ev.card.dmgBy ?? {})[inst.src.uid] !== g.turn) return false;
  }
  if (r.ctrKind && ev.ctrKind && r.ctrKind !== ev.ctrKind) return false;
  if (r.ctrYou && ev.by !== undefined && ev.by !== me) return false;
  if (r.tokenF && ev.ev === 'token') {
    if (!tokenMatches(g, ev.tokenSpec, r.tokenF)) return false;
  }
  if (r.instead.k === 'prevent' && hasPStatic(g, g.players.map(q => q.id), 'noPrevent')) return false;
  if (r.cond && inst.src && !condFromEngine(g, me, r, inst.src, ev)) return false;
  // Self-replacement: subject is the source itself.
  if (r.self && ev.card && inst.src && ev.card.uid !== inst.src.uid) return false;
  return true;
}

function tokenMatches(_g: Game, spec: TokenSpec | string | undefined, f: Filter): boolean {
  if (!spec) return false;
  const sub = typeof spec === 'string' ? [] : (spec.sub ?? []);
  const types = typeof spec === 'string' ? [] : spec.types;
  const preset = typeof spec === 'string' ? undefined : spec.preset;
  if (f.types) {
    const want = f.types.map(t => t.toLowerCase());
    const have = [
      ...types.map(t => t.toLowerCase()),
      ...sub.map(t => t.toLowerCase()),
      ...(preset ? [preset.toLowerCase()] : []),
    ];
    if (!want.every(t => have.includes(t) || have.includes(t.replace(/s$/, '')))) return false;
  }
  return true;
}

function condFromEngine(g: Game, me: number, r: Replacement, src: Card, ev: ReplEvt): boolean {
  if (!r.cond) return true;
  return condOk(g, me, r.cond, src, ev.player !== undefined ? { player: ev.player, amount: ev.n } : undefined, ev.card);
}

function bucket616(cands: ReplInst[]): ReplInst[] {
  const self = cands.filter(c => c.r.self);
  if (self.length) return self;
  const zc = cands.filter(c => c.r.zoneChange || c.r.instead.k === 'exile' || c.r.instead.k === 'shuffle');
  if (zc.length) return zc;
  return cands;
}

function affectedChooser(ev: ReplEvt): number {
  if (ev.card) {
    // Affected object's controller, or owner if it has no controller (not on the battlefield).
    return ev.from && ev.from !== 'battlefield' ? ev.card.owner : ctl(ev.card);
  }
  if (ev.to?.card) return ctl(ev.to.card);
  if (ev.to?.player !== undefined) return ev.to.player;
  if (ev.player !== undefined) return ev.player;
  return 0;
}

/** AI / test hook: pick a replacement in the current 616 bucket. */
function pickRepl(g: Game, ev: ReplEvt, bucket: ReplInst[]): ReplInst {
  if (bucket.length === 1) return bucket[0];
  if (g.pickRepl) {
    const i = g.pickRepl(bucket.map(b => b.label), ev);
    return bucket[Math.max(0, Math.min(bucket.length - 1, i))];
  }
  return sensible(g, ev, bucket);
}

function sensible(g: Game, ev: ReplEvt, bucket: ReplInst[]): ReplInst {
  const chooser = affectedChooser(ev);
  const score = (inst: ReplInst): number => {
    const k = inst.r.instead.k;
    const mine = eventHurtsChooser(g, ev, chooser);
    if (ev.ev === 'token' || ev.ev === 'counters' || ev.ev === 'gainLife' || ev.ev === 'draw') {
      // Maximize the amount we receive: apply plus/plusToken first so a later mul compounds, then mul.
      if (k === 'plusCount' || k === 'plus' || k === 'plusToken') return 300;
      if (k === 'mul') return 200 + ((inst.r.instead as { n: number }).n ?? 2);
      if (k === 'drawInstead') return ev.ev === 'gainLife' ? -50 : 0;
    }
    if (ev.ev === 'damage') {
      if (mine) {
        if (k === 'prevent') return 400;
        if (k === 'redirect') return 350;
        if (k === 'floorLife') return 300;
        if (k === 'mul' || k === 'plus') return -100;
      } else {
        if (k === 'mul') return 400;
        if (k === 'plus') return 300;
        if (k === 'prevent' || k === 'redirect') return -100;
      }
    }
    if (ev.ev === 'die' || ev.ev === 'toGy') {
      // Prefer shuffle (Colossus) over exile when it's our card; prefer exile of opponents' cards.
      const ours = ev.card ? ev.card.owner === chooser : false;
      if (k === 'shuffle') return ours ? 400 : 100;
      if (k === 'exile') return ours ? 200 : 400;
    }
    if (ev.ev === 'extraTurn') {
      // Skip an opponent's extra turn; don't skip our own.
      if (k === 'skip') return ev.player === chooser ? -400 : 400;
    }
    return 0;
  };
  return [...bucket].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0];
}

function eventHurtsChooser(g: Game, ev: ReplEvt, chooser: number): boolean {
  if (ev.ev !== 'damage') return false;
  if (ev.to?.player === chooser) return true;
  if (ev.to?.card && ctl(ev.to.card) === chooser) return true;
  return false;
}

function applyOne(g: Game, ev: ReplEvt, inst: ReplInst): ReplEvt {
  const r = inst.r;
  const k = r.instead;
  const who = inst.src ? nm(inst.src) : inst.label;
  switch (k.k) {
    case 'prevent': {
      const amt = k.n ?? ev.n;
      const use = Math.min(ev.n, amt);
      ev = { ...ev, n: ev.n - use };
      log(g, `${who}: ${use} damage is prevented.`);
      if (ev.n <= 0) ev.cancelled = true;
      return ev;
    }
    case 'redirect': {
      const dest = k.to === 'attached' && inst.src?.attachedTo !== undefined
        ? findCard(g, inst.src.attachedTo)
        : inst.src;
      if (!dest) return ev;
      log(g, `${who}: the damage is dealt to ${nm(dest)} instead.`);
      return { ...ev, to: { card: dest } };
    }
    case 'plus':
      log(g, `${who}: ${ev.ev} plus ${k.n}.`);
      return { ...ev, n: ev.n + k.n };
    case 'mul':
      log(g, `${who}: ${ev.ev} is multiplied by ${k.n}.`);
      return { ...ev, n: ev.n * k.n };
    case 'plusCount':
      log(g, `${who}: ${k.n} additional.`);
      return { ...ev, n: ev.n + k.n };
    case 'plusToken': {
      // Same-kind additional tokens join the event (so a later “twice as many” compounds).
      if (tokenMatches({} as Game, ev.tokenSpec, { types: [k.preset] })) {
        log(g, `${who}: create an additional ${k.preset} token.`);
        return { ...ev, n: ev.n + 1 };
      }
      const extra = ev.extraTokens ? [...ev.extraTokens] : [];
      extra.push({ name: k.preset, colors: [], types: ['Artifact'], sub: [k.preset], preset: k.preset });
      log(g, `${who}: create an additional ${k.preset} token.`);
      return { ...ev, extraTokens: extra };
    }
    case 'exile':
      log(g, `${who}: ${ev.card ? nm(ev.card) : 'it'} is exiled instead.`);
      return { ...ev, dest: 'exile' };
    case 'shuffle':
      log(g, `${who}: ${ev.card ? nm(ev.card) : 'it'} is shuffled into its owner's library instead.`);
      return { ...ev, dest: 'library' };
    case 'skip':
      log(g, `${who}: the extra turn is skipped.`);
      return { ...ev, cancelled: true };
    case 'floorLife': {
      if (ev.to?.player === undefined) return ev;
      const life = g.players[ev.to.player].life;
      const cap = Math.max(0, life - k.n);
      const n = Math.min(ev.n, cap);
      if (n < ev.n) log(g, `${who}: damage that would reduce the life total below ${k.n} is reduced.`);
      return { ...ev, n };
    }
    case 'drawInstead':
      log(g, `${who}: draw ${ev.n} card${ev.n === 1 ? '' : 's'} instead of gaining life.`);
      return { ...ev, became: 'draw' };
    default:
      return ev;
  }
}

export function addTempRepl(g: Game, r: Replacement, by: number, srcUid?: number): void {
  const id = `tmp${++_id}`;
  (g.tempRepls ??= []).push({ id, r, by, srcUid, turn: g.turn, until: r.until });
}

export function clearEotRepls(g: Game): void {
  if (g.tempRepls) g.tempRepls = g.tempRepls.filter(t => t.until !== 'eot' || t.turn === g.turn);
}

/** Plan how many tokens of `spec` (plus extras) to create after 616. */
export function planTokenEvent(g: Game, pid: number, baseN: number, creature: boolean, spec?: TokenSpec | string): { n: number; extra: (TokenSpec | string)[] } {
  if (baseN <= 0) return { n: 0, extra: [] };
  const ev = applyReplacements(g, { ev: 'token', player: pid, n: baseN, creature, tokenSpec: spec, extraTokens: [] });
  if (ev.cancelled) return { n: 0, extra: [] };
  return { n: ev.n, extra: ev.extraTokens ?? [] };
}

export function tokenIsCreature(spec: TokenSpec | string | undefined, cards: Record<string, CardDef>): boolean {
  if (!spec) return true;
  if (typeof spec === 'string') return !!cards[spec]?.types.includes('Creature');
  return spec.types.includes('Creature');
}
