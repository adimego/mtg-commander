import { ImportDialog } from './ImportDialog';
import { compileScry } from './import/classify';
import type { ScryCard } from './import/scryfall';
import * as decks from './import/deck';
import { DragEvent, useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { emblemsOf, sorceryTiming, Game, Card, CardDef, Target, TargetSpec, StackItem, Cost, newGame, startGame, mulligan, def, isType, hasKw, power, toughness, costOf, canCast, canPlayLand, castSpell, playLand, validTarget, canAttack, declareAttackers, declareBlockers, attackers, canBlock, opponents, findCard, COLORS, STEPS, DECKS, CARDS, manaAvailable, pass, activate, canActivate, chooseTriggerTargets, describeTarget, validSlot, spellSlots, abilitySlots, trigSlots, answerDecision, maxX, modeRange, castZone, tapForMana, ctr, costText, defenders, isCommander, blockReason, menaceShort, registerCards } from './engine/engine';
import { DecisionDialog, KickerDialog, XDialog, ModesDialog } from './Dialogs';
import type { TSlot, Modes } from './engine/types';
import { tick, waitingForHuman, shouldAutoPass, PassOpts } from './engine/controller';

const HUMAN = 0;
const PCOLORS = ['#4fc3f7', '#ef5350', '#ffb300', '#66bb6a'];
export const costStr = (c: Cost) => `${c.generic ? `{${c.generic}}` : ''}${COLORS.map(k => `{${k}}`.repeat(c[k] || 0)).join('')}` || '{0}';
const STEP_LABEL: Record<string, string> = { untap: 'Untap', upkeep: 'Upkeep', draw: 'Draw', main1: 'Main 1', beginCombat: 'Begin combat', attackers: 'Attack', blockers: 'Block', firstStrike: 'First strike', damage: 'Damage', main2: 'Main 2', end: 'End', cleanup: 'Cleanup' };
const SHOWN_STEPS = STEPS.filter(s => s !== 'untap' && s !== 'cleanup' && s !== 'firstStrike');
const youGrammar = (t: string) => t.replace(/^You's/, 'Your').replace(/You's/g, 'your').replace(/^You (plays|casts|mulligans|loses|gains|discards|wins|activates|sacrifices)/, (_, v: string) => 'You ' + (v === 'mulligans' ? 'mulligan' : v.endsWith('es') && v !== 'loses' && v !== 'sacrifices' && v !== 'activates' ? v.slice(0, -2) : v.slice(0, -1))).replace(/to You\./g, 'to you.').replace(/attacks You\./g, 'attacks you.').replace(/under You's/g, 'under your');
const poss = (g: Game, pid: number) => (pid === HUMAN ? 'your' : `${g.players[pid].name}'s`);
const KW_HELP: Record<string, string> = {
  flying: 'Can only be blocked by creatures with flying or reach.', reach: 'Can block creatures with flying.', trample: 'Combat damage beyond what is lethal to its blockers is dealt to the player.',
  haste: 'Can attack and use {T} abilities the turn it comes under your control.', vigilance: "Attacking doesn't cause it to tap.", lifelink: 'Damage dealt by it also causes you to gain that much life.',
  deathtouch: 'Any amount of damage it deals to a creature is enough to destroy it.', 'first strike': 'Deals combat damage before creatures without first strike.', 'double strike': 'Deals both first-strike and regular combat damage.',
  menace: "Can't be blocked except by two or more creatures.", defender: "Can't attack.", flash: 'You may cast it any time you could cast an instant.', hexproof: "Can't be the target of spells or abilities your opponents control.", prowess: 'Whenever you cast a noncreature spell, it gets +1/+1 until end of turn.',
};
type AbLike = { tap?: boolean; untap?: boolean; mana?: Cost; sac?: boolean; loyalty?: number; loyX?: boolean; sacF?: { n: number }; discard?: number; life?: number; remC?: { kind: string; n: number }; exileGy?: { n: number; self?: boolean }; tapF?: { n: number } };
const abCost = (a: AbLike) => [a.loyalty !== undefined ? (a.loyX ? '−X' : `${a.loyalty > 0 ? '+' : a.loyalty === 0 ? '±' : '−'}${Math.abs(a.loyalty)}`) : '', a.mana ? costText(a.mana) : '', a.tap ? '{T}' : '', a.untap ? '{Q}' : '', a.sac ? 'Sac' : '', a.sacF ? `Sac ${a.sacF.n}` : '', a.discard ? `Discard ${a.discard}` : '', a.life ? `${a.life} life` : '', a.remC ? `−${a.remC.n} ${a.remC.kind}` : '', a.exileGy ? (a.exileGy.self ? 'Exile from gy' : `Exile ${a.exileGy.n} from gy`) : '', a.tapF ? `Tap ${a.tapF.n}` : ''].filter(Boolean).join(', ');
/** A cast or activation being set up: kicker → X → modes → one target per active slot. */
type Flow = { kind: 'cast' | 'ability' | 'trigger'; uid: number; idx?: number; kicked?: boolean; x?: number; modes?: number[]; ts: (Target | undefined)[] };
type PendingAct = Flow;
const SAVED0 = decks.activateAll();
type Hover = { id: string; uid?: number } | null;
type Modal = null | 'settings' | 'help' | 'tips' | 'import' | { pid: number; zone: 'graveyard' | 'exile' };

function ManaCost({ c }: { c: Cost }) {
  return <span className="mcost">{c.generic ? <i className="pip pip-C">{c.generic}</i> : null}{COLORS.flatMap(k => Array.from({ length: c[k] || 0 }, (_, i) => <i key={k + i} className={`pip pip-${k}`}>{k}</i>))}</span>;
}
/** Card face: Scryfall image, with a readable text frame if the image fails. */
function CardFace({ d }: { d: CardDef }) {
  const [failed, setFailed] = useState(false);
  const lim = d.limited ? <span className="limbadge" title={d.limited}>Limited</span> : null;
  if (d.img && !failed) return <><img className="cimg" src={d.img} alt={d.name} draggable={false} onError={() => setFailed(true)} />{lim}</>;
  return (
    <div className={`frame f-${d.colors.join('') || 'C'}`}>
      <div className="fname"><span>{d.name}</span><ManaCost c={d.cost} /></div><div className="fart" />
      <div className="ftype">{d.typeLine ?? d.types.join(' ')}</div><div className="ftext">{d.text}</div>
      {d.power !== undefined && <div className="fpt">{d.power}/{d.toughness}</div>}{lim}
    </div>
  );
}
/** Life total that flashes and shows a floating delta when it changes. */
function LifeTotal({ v, big }: { v: number; big?: boolean }) {
  const prev = useRef(v); const [fx, setFx] = useState<{ d: number; k: number } | null>(null);
  useEffect(() => { const d = v - prev.current; prev.current = v; if (!d) return; setFx({ d, k: Date.now() }); const t = setTimeout(() => setFx(null), 900); return () => clearTimeout(t); }, [v]);
  return (
    <div className={`life ${big ? 'big' : ''} ${v <= 10 ? 'low' : ''} ${fx ? (fx.d < 0 ? 'dmg' : 'heal') : ''}`} title="Life total. You lose at 0.">
      {v}{fx && <span key={fx.k} className={`delta ${fx.d < 0 ? 'neg' : 'pos'}`}>{fx.d > 0 ? '+' : ''}{fx.d}</span>}
    </div>
  );
}

interface UI {
  g: Game; setHover: (h: Hover) => void; clickPerm: (c: Card) => void; permCls: (c: Card) => string; activateAb: (c: Card, i: number) => void;
  isTarget: (t: Target) => boolean; blockDown: (c: Card, e: React.MouseEvent) => void; blockCtx: (c: Card, e: React.MouseEvent) => void; why: (c: Card) => string | null; dropOn: (t: Target, e: DragEvent) => void; dragStart: (c: Card, e: DragEvent) => void;
  clickPlayer: (pid: number) => void; atkPlan: Record<number, number>; atkPw: Record<number, number>; atkWalker: number | null; atkTarget?: number; declaring: boolean; openZone: (pid: number, zone: 'graveyard' | 'exile') => void; clickCommand: (c: Card) => void; canTapMana: (cs: Card[]) => boolean; tapMana: (cs: Card[]) => void;
}

function Permanent({ ui, c }: { ui: UI; c: Card }) {
  const { g } = ui; const d = def(c); const cr = isType(c, 'Creature'); const mine = c.owner === HUMAN;
  const sick = cr && c.sick && !hasKw(c, 'haste') && c.owner === g.active;
  const atkTo = c.attacking ?? ui.atkPlan[c.uid];
  const walker = isType(c, 'Planeswalker'); const [open, setOpen] = useState(false);
  const abs = mine ? (d.abilities ?? []).map((a, i) => ({ a, i, ok: canActivate(g, HUMAN, c, i) })).filter(x => !walker || x.a.loyalty === undefined) : [];
  const loyAbs = walker ? (d.abilities ?? []).map((a, i) => ({ a, i, ok: mine && canActivate(g, HUMAN, c, i) })).filter(x => x.a.loyalty !== undefined) : [];
  const loyWhy = (a: AbLike & { loyalty?: number }) => !mine ? 'Opponent\'s planeswalker' : c.usedLoyalty === g.turn ? 'Already activated a loyalty ability this turn' : !sorceryTiming(g, HUMAN) ? 'Loyalty abilities: your main phase, empty stack' : (a.loyalty ?? 0) < 0 && ctr(c, 'loyalty') < -(a.loyalty ?? 0) ? 'Not enough loyalty' : 'Can\'t activate right now';
  const pwTarget = walker && !mine && ui.declaring; const aimed = pwTarget && ui.atkWalker === c.uid;
  const atkW = c.atkPw ?? ui.atkPw[c.uid]; const atkWName = atkW !== undefined ? findCard(g, atkW) && def(findCard(g, atkW)!).name.split(',')[0] : undefined;
  const t = { card: c.uid };
  return (
    <div className={`slot ${c.tapped ? 'tapped' : ''}`} data-uid={c.uid}
      onDragOver={e => { if (ui.isTarget(t) || pwTarget) e.preventDefault(); }} onDrop={e => ui.dropOn(t, e)}>
      <div className={`perm ${walker ? 'walker' : ''} ${pwTarget ? 'atkpick' : ''} ${aimed ? 'atktarget' : ''} ${c.attacking !== undefined ? 'attacking' : ''} ${c.blocking !== undefined ? 'blocking' : ''} ${ui.permCls(c)}`}
        draggable={mine && ui.declaring && canAttack(g, c)} onDragStart={e => ui.dragStart(c, e)}
        onMouseDown={e => ui.blockDown(c, e)} onContextMenu={e => ui.blockCtx(c, e)} onClick={e => { if (walker && mine && !ui.declaring) setOpen(o => !o); if (pwTarget) e.stopPropagation(); ui.clickPerm(c); }} onMouseEnter={() => ui.setHover({ id: c.id, uid: c.uid })} onMouseLeave={() => ui.setHover(null)}>
        <CardFace d={d} />
        {cr && <span className={`pt ${c.damage ? 'hurt' : ''} ${c.pp || c.pt ? 'pumped' : ''}`} title={`Power/toughness${c.damage ? ` (${c.damage} damage marked)` : ''}`}>{power(g, c)}/{toughness(g, c) - c.damage}</span>}
        {sick && <span className="badge sick" title="Summoning sick: can't attack or use {T} abilities this turn">💤</span>}
        {atkTo !== undefined && <span className="badge atk" style={{ background: PCOLORS[atkTo] }}>⚔ {atkWName ? `◆ ${atkWName}` : g.players[atkTo].name}</span>}
        {walker && mine && !open && loyAbs.some(x => x.ok) && <span className="badge loyready" title="Click to use a loyalty ability">◆ ready</span>}
        {walker && <span className={`loyshield ${ctr(c, 'loyalty') <= 2 ? 'low' : ''}`} data-loyalty={ctr(c, 'loyalty')} title={`Loyalty ${ctr(c, 'loyalty')}`}>{ctr(c, 'loyalty')}</span>}
        {c.anim && <span className="badge anim" title="Planeswalker is a creature until end of turn">⚔ creature</span>}
        {aimed && <span className="badge atk aim">🎯 Target</span>}
        {walker && loyAbs.length > 0 && open && <div className="loypanel" onClick={e => e.stopPropagation()}>{loyAbs.map(({ a, i, ok }) => {
          const k = a.loyX || (a.loyalty ?? 0) < 0 ? ((a.loyalty ?? 0) <= -6 ? 'ult' : 'minus') : (a.loyalty ?? 0) > 0 ? 'plus' : 'zero';
          return <button key={i} data-loy={i} className={`loyab ${k}`} disabled={!ok} title={ok ? a.label : `${a.label}\n— ${loyWhy(a)}`} onClick={e => { e.stopPropagation(); ui.activateAb(c, i); setOpen(false); }}><span className="lcost">{abCost(a)}</span><span className="ltext">{a.label.replace(/^[+−-]?(\d+|x|X)\s*:\s*/, '')}</span></button>; })}</div>}
        {c.blocking !== undefined && <span className="badge blk">🛡 Block</span>}
        {isCommander(g, c) && <span className="badge cmdr" title="Commander">★</span>}
        {c.token && <span className="badge tok" title="Token">TOKEN</span>}
        {Object.entries(c.counters ?? {}).some(([k, v]) => v && !(walker && k === 'loyalty')) && <div className="ctrs">{Object.entries(c.counters ?? {}).filter(([k, v]) => v && !(walker && k === 'loyalty')).map(([k, v]) => <span key={k} data-counter={k} className={`ctr ${k === '+1/+1' ? 'plus' : k === '-1/-1' ? 'minus' : k === 'loyalty' ? 'loy' : ''}`} title={`${v} ${k} counter${v > 1 ? 's' : ''}`}>{k === 'loyalty' ? `◆${v}` : `${k === '+1/+1' || k === '-1/-1' ? k : k} ×${v}`}</span>)}</div>}
        {c.attachedTo !== undefined && <span className="badge host" title={`Attached to ${findCard(g, c.attachedTo) ? def(findCard(g, c.attachedTo)!).name : '?'}`}>⛓ {findCard(g, c.attachedTo) ? def(findCard(g, c.attachedTo)!).name : ''}</span>}
        {(() => { const att = g.players.flatMap(q => q.battlefield).filter(x => x.attachedTo === c.uid); return att.length ? <div className="attached" data-attached={att.length}>{att.map(x => <span key={x.uid} title={def(x).name}>⚔ {def(x).name}</span>)}</div> : null; })()}
        {abs.length > 0 && <div className="abstrip">{abs.map(({ a, i, ok }) => (
          <button key={i} disabled={!ok} title={`${abCost(a)}: ${a.label}`} onClick={e => { e.stopPropagation(); ui.activateAb(c, i); }}><b>{abCost(a)}</b> {a.label}</button>))}</div>}
      </div>
      {ui.why(c) && <span className={`why ${ui.why(c)!.startsWith('✓') ? 'ok' : ui.why(c)!.startsWith('⚠') ? 'warn' : 'bad'}`}>{ui.why(c)}</span>}
    </div>
  );
}
function LandRow({ ui, cards }: { ui: UI; cards: Card[] }) {
  const groups = Object.values(cards.reduce((m, c) => ((m[c.id] ??= []).push(c), m), {} as Record<string, Card[]>));
  return <div className="lands">{groups.map(gr => { const d = def(gr[0]); const un = gr.filter(c => !c.tapped).length; return (
    <div key={d.id} className={`landchip ${un ? '' : 'alltapped'} ${ui.canTapMana(gr) ? 'tappable' : ''}`} data-land={d.id} onClick={() => ui.tapMana(gr)} onMouseEnter={() => ui.setHover({ id: d.id })} onMouseLeave={() => ui.setHover(null)} title={`${d.name}: ${un} untapped of ${gr.length}${ui.canTapMana(gr) ? ' · click to tap one for mana (it floats in your pool)' : ''}`}>
      <div className="landart" style={{ backgroundImage: `url(${d.art})` }} /><span className="landname">{d.name}</span><span className="landcount"><b>{un}</b>/{gr.length}</span>
    </div>); })}</div>;
}
function Battlefield({ ui, pid }: { ui: UI; pid: number }) {
  const p = ui.g.players[pid];
  const cr = p.battlefield.filter(c => isType(c, 'Creature')); const other = p.battlefield.filter(c => !isType(c, 'Creature') && !isType(c, 'Land')); const lands = p.battlefield.filter(c => isType(c, 'Land'));
  return (
    <div className="bf">
      <div className="row crow">{cr.length ? cr.map(c => <Permanent key={c.uid} ui={ui} c={c} />) : <span className="empty">No creatures</span>}</div>
      <div className="row nrow">{other.map(c => <Permanent key={c.uid} ui={ui} c={c} />)}</div>
      <LandRow ui={ui} cards={lands} />
    </div>
  );
}
function CommandZone({ ui, pid }: { ui: UI; pid: number }) {
  const { g } = ui; const p = g.players[pid];
  return <>{p.commanderIds.map(id => {
    const cmd = CARDS[id]; const inZone = p.command.find(c => c.id === id); const tax = 2 * (p.casts[id] ?? 0);
    const castable = pid === HUMAN && inZone && canCast(g, HUMAN, inZone);
    return (
      <div key={id} data-cmd={id} className={`cmdzone ${castable ? 'playable' : ''} ${inZone ? '' : 'away'} ${p.commanderIds.length > 1 ? 'partner' : ''}`} onClick={() => inZone && pid === HUMAN && ui.clickCommand(inZone)}
        onMouseEnter={() => ui.setHover({ id: cmd.id })} onMouseLeave={() => ui.setHover(null)} title={`${cmd.name} (command zone). Commander tax: +${tax} (each recast costs {2} more)`}>
        <CardFace d={cmd} />
        <span className="tax">TAX +{tax}</span>
        {inZone ? <span className="czcost"><ManaCost c={costOf(g, inZone)} /></span> : <span className="czlabel">{p.battlefield.some(c => c.id === cmd.id) ? 'IN PLAY' : 'AWAY'}</span>}
      </div>);
  })}</>;
}
function PlayerHeader({ ui, pid, big }: { ui: UI; pid: number; big?: boolean }) {
  const { g } = ui; const p = g.players[pid];
  return (
    <div className="phead">
      <div className="avatar" style={{ backgroundImage: `url(${CARDS[p.commanderId].art})` }} />
      <div className="pinfo">
        <div className="pname">{p.name}{g.active === pid && <span className="turnchip">TURN</span>}{g.priority === pid && !g.awaiting && <span className="priochip" title="Has priority">PRIORITY</span>}{p.lost && <span className="out">ELIMINATED</span>}</div>
        <div className="pdeck">{p.deckName}</div>
        <div className="counts">
          <span title="Cards in hand">✋ {p.hand.length}</span><span title="Cards in library">📚 {p.library.length}</span>
          <button className="zbtn" title="View graveyard" onClick={e => { e.stopPropagation(); ui.openZone(pid, 'graveyard'); }}>🪦 {p.graveyard.length}</button>
          <button className="zbtn" title="View exile" onClick={e => { e.stopPropagation(); ui.openZone(pid, 'exile'); }}>⛔ {p.exile.length}</button>
          {pid === HUMAN && <span title="Untapped mana available">💧 {manaAvailable(p)}</span>}
          {pid === HUMAN && p.pool.length > 0 && <span className="pool" data-pool={p.pool.join(',')} title="Floating mana: spent first, empties at the end of each step"><span className="lbl">POOL</span>{p.pool.map((m, i) => <i key={i} className={`pip pip-${m.includes('|') || m === 'ANY' || m === 'IDENTITY' ? 'multi' : m}`}>{m.includes('|') ? m.replace('|', '/') : m === 'ANY' ? '★' : m}</i>)}</span>}
        </div>
      </div>
      <LifeTotal v={p.life} big={big} />{p.poison ? <span className="poison" data-poison={p.poison} title="poison counters (10 loses)">☠ {p.poison}</span> : null}
      <CommandZone ui={ui} pid={pid} />
    </div>
  );
}
function CmdDamage({ g, pid }: { g: Game; pid: number }) {
  const p = g.players[pid];
  return <div className="cdmg" title="Commander damage taken from each commander. 21 from one commander = you lose.">
    <span className="lbl">CMDR DMG</span>{g.players.filter(o => o.id !== pid).map(o => { const v = p.cmdDamage[o.id] || 0; return (
      <span key={o.id} className={`cd ${v >= 14 ? 'danger' : ''} ${v === 0 ? 'zero' : ''}`} style={{ borderColor: PCOLORS[o.id] }} title={`${v}/21 combat damage from ${CARDS[o.commanderId].name} (${o.name})`}>
        <i style={{ backgroundImage: `url(${CARDS[o.commanderId].art})` }} /><b>{v}</b>/21</span>); })}</div>;
}
function Emblems({ g, pid }: { g: Game; pid: number }) {
  const es = emblemsOf(g.players[pid]); if (!es.length) return null;
  return <div className="emblems" data-emblems={es.length}>{es.map(e => <span key={e.uid} className="emblem" title={`Emblem — ${def(e).text}`}>✦ <b>{def(e).name.replace(/ emblem$/, '')}</b> <i>{def(e).text}</i></span>)}</div>;
}
function OppPanel({ ui, pid }: { ui: UI; pid: number }) {
  const { g } = ui; const p = g.players[pid]; const t = { player: pid };
  const tgt = ui.isTarget(t); const atkSel = ui.declaring && ui.atkTarget === pid;
  return (
    <section className={`player opp ${g.active === pid ? 'active' : ''} ${p.lost ? 'lost' : ''} ${tgt ? 'targetable' : ''} ${atkSel ? 'atktarget' : ''} ${ui.declaring && !p.lost ? 'atkpick' : ''}`} style={{ ['--pc' as string]: PCOLORS[pid] }} data-player={pid}
      onClick={() => ui.clickPlayer(pid)} onDragOver={e => { if (tgt || (ui.declaring && !p.lost)) e.preventDefault(); }} onDrop={e => ui.dropOn(t, e)}>
      <PlayerHeader ui={ui} pid={pid} />
      <CmdDamage g={g} pid={pid} />
      <Emblems g={g} pid={pid} />
      {atkSel && <div className="atkflag">🎯 Attack target</div>}
      <Battlefield ui={ui} pid={pid} />
    </section>
  );
}
function StackView({ g, ui }: { g: Game; ui: UI }) {
  if (!g.stack.length) return null;
  const items = [...g.stack].reverse();
  return (
    <div className="stackview">
      <div className="stackhead">THE STACK <span>{items.length} item{items.length > 1 ? 's' : ''} · top resolves first</span></div>
      <div className="sitems">{items.map((it: StackItem, i) => { const t = { stack: it.id }; const pick = ui.isTarget(t); return (
        <div key={it.id} className={`sitem ${i === 0 ? 'top' : ''} ${pick ? 'targetable' : ''}`} data-stack={it.id} style={{ borderColor: PCOLORS[it.controller] }}
          onClick={() => pick && ui.dropOn(t, null as unknown as DragEvent)} onDragOver={e => { if (pick) e.preventDefault(); }} onDrop={e => ui.dropOn(t, e)}
          onMouseEnter={() => ui.setHover({ id: it.sourceId })} onMouseLeave={() => ui.setHover(null)}>
          <div className="scard"><CardFace d={CARDS[it.sourceId]} /></div>
          <div className="sinfo">
            <span className={`kind k-${it.kind}`}>{it.kind === 'spell' ? 'SPELL' : it.kind === 'trigger' ? '⚡ TRIGGER' : 'ABILITY'}</span>
            <b>{it.label}</b>
            <span className="smeta"><span style={{ color: PCOLORS[it.controller] }}>{g.players[it.controller].name}</span>{it.target && <> → {describeTarget(g, it.target)}</>}</span>
            {it.uncounterable && <span className="smeta">Can't be countered</span>}
          </div>
          {i === 0 && <span className="next">RESOLVES NEXT</span>}
        </div>); })}</div>
    </div>
  );
}
/** Arrows for attacks, blocks, planned assignments and the top stack item's target. */
function Arrows({ g, plan, blk, pw }: { g: Game; plan: Record<number, number>; blk: Record<number, number>; pw: Record<number, number> }) {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const draw = () => {
      const svg = ref.current; if (!svg) return;
      const ctr = (el: Element | null) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
      const q = (s: string) => document.querySelector(s); const lines: string[] = [];
      const add = (from: Element | null, to: Element | null, color: string, dashed: boolean) => {
        const a = ctr(from), b = ctr(to); if (!a || !b) return;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.abs(a.x - b.x) * 0.15;
        lines.push(`<path d="M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" ${dashed ? 'stroke-dasharray="12 8"' : ''} marker-end="url(#ah-${color.slice(1)})" opacity="0.92" filter="url(#glow)"/>`);
      };
      for (const a of attackers(g)) {
        for (const b of a.blockedBy ?? []) add(q(`[data-uid="${b}"]`), q(`[data-uid="${a.uid}"]`), '#42a5f5', false);
        add(q(`[data-uid="${a.uid}"]`), a.atkPw !== undefined && q(`[data-uid="${a.atkPw}"]`) ? q(`[data-uid="${a.atkPw}"]`) : q(`[data-player="${a.attacking}"] .avatar`), PCOLORS[a.attacking!], !!a.blockedBy?.length);
      }
      for (const [u, pid] of Object.entries(plan)) add(q(`[data-uid="${u}"]`), pw[+u] !== undefined ? q(`[data-uid="${pw[+u]}"]`) : q(`[data-player="${pid}"] .avatar`), PCOLORS[pid], true);
      for (const [b, a] of Object.entries(blk)) add(q(`[data-uid="${b}"]`), q(`[data-uid="${a}"]`), '#42a5f5', true);
      const top = g.stack[g.stack.length - 1];
      if (top?.target) add(q(`[data-stack="${top.id}"]`), top.target.card !== undefined ? q(`[data-uid="${top.target.card}"]`) : top.target.player !== undefined ? q(`[data-player="${top.target.player}"] .avatar`) : q(`[data-stack="${top.target.stack}"]`), '#ce93d8', true);
      const cols = [...PCOLORS, '#42a5f5', '#ce93d8'];
      svg.innerHTML = `<defs><filter id="glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>${cols.map(c => `<marker id="ah-${c.slice(1)}" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="${c}"/></marker>`).join('')}</defs>${lines.join('')}`;
    };
    draw(); const t = setTimeout(draw, 320); window.addEventListener('resize', draw);
    return () => { clearTimeout(t); window.removeEventListener('resize', draw); };
  });
  return <svg ref={ref} className="arrows" />;
}
function DragLine({ uid, x, y, color }: { uid: number; x: number; y: number; color: string }) {
  const el = document.querySelector(`[data-uid="${uid}"]`); if (!el) return null;
  const r = el.getBoundingClientRect(); const ax = r.left + r.width / 2, ay = r.top + r.height / 2;
  return <svg className="arrows dragline"><defs><marker id="dl-ah" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill={color} /></marker></defs>
    <path d={`M${ax},${ay} Q${(ax + x) / 2},${(ay + y) / 2 - Math.abs(ax - x) * 0.15} ${x},${y}`} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" markerEnd="url(#dl-ah)" opacity="0.95" /></svg>;
}
function Preview({ g, h }: { g: Game | null; h: Hover }) {
  if (!h) return <div className="preview empty"><div className="hint">Hover any card to see it here.<br /><br /><kbd>?</kbd> shows keyboard shortcuts</div></div>;
  const d = CARDS[h.id]; const c = g && h.uid !== undefined ? findCard(g, h.uid) : undefined;
  const kws = (d.keywords ?? []).filter(k => KW_HELP[k]);
  return (
    <div className="preview">
      <div className="pvcard"><CardFace d={d} /></div>
      <div className="pvtext">
        <div className="pvname">{d.name} <ManaCost c={d.cost} /></div>
        <div className="pvtype">{d.typeLine}</div>
        {c && g && isType(c, 'Creature') && <div className="pvstate">Now: <b>{power(g, c)}/{toughness(g, c)}</b>{c.damage ? ` · ${c.damage} damage` : ''}{c.tapped ? ' · tapped' : ''}{c.sick && !hasKw(c, 'haste') ? ' · summoning sick' : ''}{c.attacking !== undefined ? ` · attacking ${g.players[c.attacking].name}` : ''}</div>}
        {d.limited && <div className="limnote">⚠ {d.limited}</div>}
        {kws.map(k => <div key={k} className="kwhelp"><b>{k[0].toUpperCase() + k.slice(1)}</b>: {KW_HELP[k]}</div>)}
      </div>
    </div>
  );
}
function ZoneViewer({ g, pid, zone, close, setHover }: { g: Game; pid: number; zone: 'graveyard' | 'exile'; close: () => void; setHover: (h: Hover) => void }) {
  const cards = [...g.players[pid][zone]].reverse();
  return (
    <div className="modal" onClick={close}><div className="mbox wide" onClick={e => e.stopPropagation()}>
      <h2>{g.players[pid].name}: {zone === 'graveyard' ? 'Graveyard' : 'Exile'} <span>({cards.length})</span><button className="x" onClick={close}>✕</button></h2>
      <div className="zgrid">{cards.length ? cards.map(c => <div key={c.uid} className="zcard" onMouseEnter={() => setHover({ id: c.id })} onMouseLeave={() => setHover(null)}><CardFace d={def(c)} /></div>) : <p className="muted">Empty.</p>}</div>
    </div></div>
  );
}
const SHORTCUTS: [string, string][] = [['Space', 'Main action button: Pass / Next / Confirm'], ['Enter', 'Confirm (keep hand, attackers, blocks)'], ['Esc', 'Cancel targeting, clear selections, close windows'], ['E', 'End turn (auto-pass until your next turn)'], ['A', 'While attacking: assign all eligible creatures to the selected opponent'], ['F', 'Toggle full screen'], ['L', 'Show or hide the game log'], ['?  or  H', 'Show this help']];
const TIPS = [
  ['🎯', 'The big button at the bottom right is always your next step. Press Space to use it.'],
  ['🖱️', 'Hover any card to see it large on the right. Click glowing cards in your hand to play them.'],
  ['⚔', 'To attack, click an opponent to choose them as the target, then click your glowing creatures. You can also drag a creature onto an opponent.'],
  ['🛡', 'When you are attacked, drag one of your untapped creatures onto the attacker it should block. Several creatures can block the same attacker (menace needs two). Right-click a blocker, or drag it onto empty space, to unassign it. Click-then-click still works too.'],
  ['📚', 'Spells and abilities go on the stack in the middle of the table. You get priority automatically when you can respond.'],
  ['★', 'Your commander waits in the command zone next to your life total. Every recast costs {2} more.'],
];

export default function App() {
  const gref = useRef<Game | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [deck, setDeck] = useState(() => localStorage.getItem('ca_deck') && DECKS.some(d => d.id === localStorage.getItem('ca_deck')) ? localStorage.getItem('ca_deck')! : DECKS[0].id);
  const [saved, setSaved] = useState<decks.SavedDeck[]>(SAVED0);
  const [aiDecks, setAiDecks] = useState<'precon' | 'mine'>(() => (localStorage.getItem('ca_ai_decks') as 'precon' | 'mine') || 'precon');
  const [speed, setSpeed] = useState(600);
  const [stopAll, setStopAll] = useState(false);
  const [anim, setAnim] = useState(true);
  const [passUntil, setPassUntil] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingAct | null>(null);
  const [atkTarget, setAtkTarget] = useState<number | null>(null);
  const [atkPlan, setAtkPlan] = useState<Record<number, number>>({});
  const [atkPwPlan, setAtkPwPlan] = useState<Record<number, number>>({});
  const [atkWalker, setAtkWalker] = useState<number | null>(null);
  const [selBlocker, setSelBlocker] = useState<number | null>(null);
  const [blkPlan, setBlkPlan] = useState<Record<number, number>>({});
  const [bdrag, setBdrag] = useState<{ uid: number; x0: number; y0: number; x: number; y: number; over: number | null; moved: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dragRef = useRef<{ move: (e: MouseEvent) => void; up: (e: MouseEvent) => void }>({ move: () => {}, up: () => {} });
  const [hover, setHover] = useState<Hover>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [logOpen, setLogOpen] = useState(true);
  const [fs, setFs] = useState(false);
  const g = gref.current;
  const opts: PassOpts = { stopAll, passUntilTurn: passUntil };

  const act = useCallback((f: (g: Game) => void) => { if (gref.current) { f(gref.current); bump(); } }, []);
  // test/debug hook (only with ?debug in the URL): lets scripted screenshots stage a board
  useEffect(() => { if (/[?&]debug\b/.test(location.search)) (window as unknown as Record<string, unknown>).__ca = { game: () => gref.current, act, CARDS, compile: (o: Record<string, unknown>) => { const d = compileScry({ colors: [], color_identity: [], keywords: [], mana_cost: '', ...o } as unknown as ScryCard).def; registerCards([d]); return d.id; } }; }, [act]);
  function newMatch() {
    localStorage.setItem('ca_deck', deck);
    const pre = DECKS.slice(0, 4).map(d => d.id).filter(x => x !== deck);
    const mine = saved.map(d => d.id).filter(x => x !== deck).sort(() => Math.random() - 0.5);
    const others = (aiDecks === 'mine' ? [...mine, ...pre] : pre).slice(0, 3);
    gref.current = newGame({ decks: [deck, ...others] }); setAtkPlan({}); setBlkPlan({}); setPending(null); setPassUntil(null); bump();
    if (!localStorage.getItem('ca_tips_seen')) setModal('tips');
  }
  useEffect(() => { const f = () => setFs(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  const toggleFs = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); };

  useEffect(() => {
    if (!g || modal === 'tips' || waitingForHuman(g, opts)) return;
    const t = setTimeout(() => act(g => { const n = g.log.length; for (let i = 0; i < 300 && g.log.length === n && !waitingForHuman(g, opts); i++) tick(g, opts); }), g.priority === HUMAN ? 0 : speed);
    return () => clearTimeout(t);
  });

  // ---------- derived state ----------
  const me = g?.players[HUMAN];
  const myTurn = !!g && g.active === HUMAN && !me!.lost;
  const humanChoice = g?.choice && g.players[g.choice.controller].human ? g.choice : null;
  const humanDecision = g?.decision && g.players[g.decision.pid].human ? g.decision : null;
  /** a 'you may cast that card now' decision steps aside while the human runs the normal cast flow for that card */
  const blockDec = humanDecision && !(humanDecision.kind === 'cast' && pending?.kind === 'cast' && pending.uid === humanDecision.uid) ? humanDecision : null;
  // the active flow: a human trigger needing targets/modes takes over from any half-built cast
  const flow: Flow | null = g && humanChoice ? (pending?.kind === 'trigger' && pending.uid === humanChoice.sourceUid ? pending : { kind: 'trigger', uid: humanChoice.sourceUid, ts: [] }) : pending;
  const flowCard = g && flow && flow.kind !== 'trigger' ? [...me!.hand, ...me!.command, ...me!.battlefield, ...me!.graveyard, ...me!.exile].find(c => c.uid === flow.uid) : undefined;
  const flowName = flow ? (flow.kind === 'trigger' ? CARDS[humanChoice!.sourceId].name : flowCard ? def(flowCard).name : '') : '';
  const flowAb = flow?.kind === 'ability' && flowCard ? def(flowCard).abilities?.[flow.idx!] : undefined;
  const flowSlots: TSlot[] = !flow ? [] : flow.kind === 'trigger' ? trigSlots(humanChoice!.trig) : flow.kind === 'ability' ? (flowAb ? abilitySlots(flowAb) : []) : flowCard ? spellSlots(def(flowCard)) : [];
  const flowModes: Modes | undefined = !flow ? undefined : flow.kind === 'trigger' ? humanChoice!.trig.modes : flow.kind === 'ability' ? flowAb?.modes : flowCard ? def(flowCard).spell?.modes : undefined;
  const flowActive = flowModes ? (flow?.modes ?? []).flatMap(i => modeRange(flowModes, i)) : flowSlots.map((_, i) => i);
  const flowStage: null | 'kicker' | 'x' | 'modes' | 'targets' = !g || !flow ? null
    : flow.kind === 'cast' && flowCard && def(flowCard).kicker && flow.kicked === undefined ? 'kicker'
    : flow.x === undefined && (flow.kind === 'cast' ? !!flowCard && !!costOf(g, flowCard).x : flow.kind === 'ability' ? !!flowAb?.mana?.x || !!flowAb?.loyX : false) ? 'x'
    : flowModes && !flow.modes ? 'modes'
    : flow.ts.length < flowActive.length ? 'targets' : null;
  const curSlot = flowStage === 'targets' ? flowSlots[flowActive[flow!.ts.length]] : undefined;
  const tctx = flow ? { srcUid: flow.kind === 'trigger' ? humanChoice!.sourceUid : flow.kind === 'ability' ? flow.uid : undefined, srcId: flow.kind === 'trigger' ? humanChoice!.sourceId : flowCard?.id, taken: flow.ts } : {};
  const isTarget = (t: Target) => !!g && !!curSlot && validSlot(g, HUMAN, curSlot, t, tctx);
  const spec = curSlot; // truthy while choosing a target
  const pendingCard = flowCard;
  const blocking = !!g && g.awaiting === 'block' && defenders(g).includes(HUMAN) && !g.blockersDone.includes(HUMAN) && !me!.lost;
  const short = g && blocking ? menaceShort(g, blkPlan) : [];
  const declaring = !!g && g.awaiting === 'attack' && g.active === HUMAN && !me!.lost;
  const myPriority = !!g && g.priority === HUMAN && !g.awaiting && !g.choice && g.winner === null && g.started && !shouldAutoPass(g, HUMAN, opts);
  const top = g?.stack[g.stack.length - 1];
  const curAtkTarget = g ? (atkTarget !== null && !g.players[atkTarget].lost && atkTarget !== HUMAN ? atkTarget : opponents(g, HUMAN).sort((a, b) => a.life - b.life)[0]?.id) : undefined;
  const inMain = !!g && (g.step === 'main1' || g.step === 'main2');

  // ---------- actions ----------
  const clearSel = () => { setPending(null); setSelBlocker(null); };
  /** Finish or advance a flow: auto-skip impossible optional slots and fire once everything is chosen. */
  function advance(f: Flow) {
    if (!g) return;
    const card = f.kind === 'trigger' ? undefined : [...me!.hand, ...me!.command, ...me!.battlefield, ...me!.graveyard, ...me!.exile].find(c => c.uid === f.uid);
    const ab = f.kind === 'ability' && card ? def(card).abilities?.[f.idx!] : undefined;
    const slots = f.kind === 'trigger' ? trigSlots(g.choice!.trig) : ab ? abilitySlots(ab) : card ? spellSlots(def(card)) : [];
    const ms = f.kind === 'trigger' ? g.choice!.trig.modes : ab ? ab.modes : card ? def(card).spell?.modes : undefined;
    if (ms && !f.modes) { setPending(f); return; }
    const active = ms ? f.modes!.flatMap(i => modeRange(ms, i)) : slots.map((_, i) => i);
    // optional slot with nothing legal: skip it
    while (f.ts.length < active.length) {
      const sl = slots[active[f.ts.length]]; if (!sl.opt) break;
      const any = [...g.players.map(q => ({ player: q.id })), ...g.players.flatMap(q => [...q.battlefield, ...q.graveyard].map(c => ({ card: c.uid }))), ...g.stack.map(it => ({ stack: it.id }))].some(t => validSlot(g, HUMAN, sl, t, { srcUid: f.kind !== 'cast' ? f.uid : undefined, taken: f.ts }));
      if (any) break; f = { ...f, ts: [...f.ts, undefined] };
    }
    if (f.ts.length < active.length) { setPending(f); return; }
    const full: (Target | undefined)[] = slots.map(() => undefined); active.forEach((i, k) => (full[i] = f.ts[k]));
    setPending(null);
    act(g => {
      if (f.kind === 'trigger') chooseTriggerTargets(g, full, f.modes);
      else if (f.kind === 'cast') { if (!castSpell(g, HUMAN, f.uid, { targets: full, modes: f.modes, x: f.x, kicked: f.kicked })) flash("Couldn't cast that (targets or mana no longer valid)."); }
      else if (!activate(g, HUMAN, f.uid, f.idx!, { targets: full, modes: f.modes, x: f.x })) flash("Couldn't activate that.");
    });
  }
  const targetClick = (t: Target) => {
    if (!g || !flow || !isTarget(t)) return false;
    advance({ ...flow, ts: [...flow.ts, t] }); return true;
  };
  const skipSlot = () => { if (flow && curSlot?.opt) advance({ ...flow, ts: [...flow.ts, undefined] }); };
  function startCast(c: Card) {
    if (!g) return;
    const d = def(c); const f: Flow = { kind: 'cast', uid: c.uid, ts: [] };
    if (d.kicker && !canCast(g, HUMAN, c, { kicked: true })) f.kicked = false;
    if (d.kicker && f.kicked === undefined) { setPending(f); return; }
    begin2(f, c);
  }
  function begin2(f: Flow, c: Card) {
    if (!g) return;
    if (f.x === undefined && costOf(g, c).x) { setPending(f); return; }
    advance(f);
  }
  function clickHand(c: Card) {
    if (!g) return;
    if (canPlayLand(g, HUMAN, c)) return act(g => playLand(g, HUMAN, c.uid));
    if (!canCast(g, HUMAN, c)) return;
    startCast(c);
  }
  function activateAb(c: Card, i: number) {
    if (!g || !canActivate(g, HUMAN, c, i)) return;
    const a = def(c).abilities![i]; const f: Flow = { kind: 'ability', uid: c.uid, idx: i, ts: [] };
    if (a.mana?.x || a.loyX) { setPending(f); return; }
    advance(f);
  }
  const canTapMana = (cs: Card[]) => !!g && (g.priority === HUMAN || g.castNow?.pid === HUMAN) && (!g.decision || g.decision.kind === 'cast') && !g.choice && !g.res && cs.some(c => c.owner === HUMAN && !c.tapped && !!def(c).mana?.[0] && def(c).mana![0].tap !== false && !def(c).mana![0].cost);
  const tapMana = (cs: Card[]) => { if (!canTapMana(cs)) return; const c = cs.find(x => !x.tapped)!; act(g => { tapForMana(g, HUMAN, c.uid); }); };
  function toggleAttacker(c: Card, to = curAtkTarget) {
    const w = atkWalker !== null && findCard(g!, atkWalker)?.owner === to ? atkWalker : undefined;
    const p = { ...atkPlan }; const pw = { ...atkPwPlan };
    if (p[c.uid] !== undefined && to === p[c.uid] && pw[c.uid] === w) { delete p[c.uid]; delete pw[c.uid]; }
    else if (canAttack(g!, c) && to !== undefined) { p[c.uid] = to; if (w !== undefined) pw[c.uid] = w; else delete pw[c.uid]; }
    setAtkPlan(p); setAtkPwPlan(pw);
  }
  function clickPerm(c: Card) {
    if (!g) return;
    if (spec) { targetClick({ card: c.uid }); return; }
    if (declaring && c.owner !== HUMAN && isType(c, 'Planeswalker')) { setAtkTarget(c.owner); setAtkWalker(atkWalker === c.uid ? null : c.uid); return; }
    if (c.owner === HUMAN && !declaring && !blocking && isType(c, 'Creature') && !(def(c).abilities ?? []).length && canTapMana([c])) { tapMana([c]); return; }
    if (declaring && c.owner === HUMAN) return toggleAttacker(c);
    if (blocking) {
      if (c.owner === HUMAN && isType(c, 'Creature') && !c.tapped) return;
      if (c.attacking === HUMAN && selBlocker !== null) { const b = findCard(g, selBlocker)!; const r = blockReason(g, b, c); if (r) flash(r); else setBlkPlan({ ...blkPlan, [selBlocker]: c.uid }); setSelBlocker(null); }
    }
  }
  function toggleBlocker(c: Card) {
    { if (blkPlan[c.uid] !== undefined) { const p = { ...blkPlan }; delete p[c.uid]; setBlkPlan(p); } else setSelBlocker(selBlocker === c.uid ? null : c.uid); }
  }
  function flash(m: string) { setToast(m); setTimeout(() => setToast(t => (t === m ? null : t)), 2600); }
  const canBlockerStart = (c: Card) => blocking && c.owner === HUMAN && isType(c, 'Creature') && !c.tapped;
  function blockDown(c: Card, e: React.MouseEvent) {
    if (e.button !== 0 || !canBlockerStart(c)) return;
    e.preventDefault(); setSelBlocker(null);
    setBdrag({ uid: c.uid, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, over: null, moved: false });
  }
  function blockCtx(c: Card, e: React.MouseEvent) {
    if (!blocking) return; e.preventDefault();
    const p = { ...blkPlan };
    if (p[c.uid] !== undefined) delete p[c.uid]; else if (c.attacking === HUMAN) for (const [b, a] of Object.entries(p)) if (a === c.uid) delete p[+b];
    setBlkPlan(p); setSelBlocker(null);
  }
  dragRef.current = {
    move: e => {
      if (!bdrag || !g) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-uid]') as HTMLElement | null;
      const u = el ? +el.dataset.uid! : NaN; const a = Number.isNaN(u) ? undefined : findCard(g, u);
      setBdrag({ ...bdrag, x: e.clientX, y: e.clientY, over: a && a.attacking === HUMAN ? u : null, moved: bdrag.moved || Math.hypot(e.clientX - bdrag.x0, e.clientY - bdrag.y0) > 6 });
    },
    up: () => {
      if (!bdrag || !g) return; const d = bdrag; setBdrag(null);
      const b = findCard(g, d.uid); if (!b) return;
      if (!d.moved) return toggleBlocker(b);
      const p = { ...blkPlan };
      if (d.over !== null) { const r = blockReason(g, b, findCard(g, d.over)!); if (r) { flash(`${def(b).name} can't block ${def(findCard(g, d.over)!).name}: ${r}`); return; } p[d.uid] = d.over; }
      else delete p[d.uid];
      setBlkPlan(p);
    },
  };
  useEffect(() => {
    const m = (e: MouseEvent) => dragRef.current.move(e), u = (e: MouseEvent) => dragRef.current.up(e);
    window.addEventListener('mousemove', m); window.addEventListener('mouseup', u);
    return () => { window.removeEventListener('mousemove', m); window.removeEventListener('mouseup', u); };
  }, []);
  function clickPlayer(pid: number) { if (spec) { targetClick({ player: pid }); return; } if (declaring && !g!.players[pid].lost && pid !== HUMAN) { setAtkTarget(pid); setAtkWalker(null); } }
  function dragStart(c: Card, e: DragEvent) {
    e.dataTransfer.setData('text/plain', String(c.uid)); e.dataTransfer.effectAllowed = 'move';
    if (!declaring && c.owner === HUMAN && me!.hand.includes(c) && spellSlots(def(c)).length && canCast(g!, HUMAN, c)) startCast(c);
  }
  function dropOn(t: Target, e: DragEvent | null) {
    e?.preventDefault?.();
    if (spec) { targetClick(t); return; }
    const uid = Number(e?.dataTransfer?.getData('text/plain'));
    if (declaring && t.player !== undefined && uid) { const c = me!.battlefield.find(x => x.uid === uid); if (c && canAttack(g!, c)) { setAtkPlan({ ...atkPlan, [uid]: t.player }); const pw = { ...atkPwPlan }; delete pw[uid]; setAtkPwPlan(pw); setAtkTarget(t.player); setAtkWalker(null); } }
    const w = declaring && t.card !== undefined ? findCard(g!, t.card) : undefined;
    if (w && uid && w.owner !== HUMAN && isType(w, 'Planeswalker')) { e?.stopPropagation?.(); const c = me!.battlefield.find(x => x.uid === uid); if (c && canAttack(g!, c)) { setAtkPlan({ ...atkPlan, [uid]: w.owner }); setAtkPwPlan({ ...atkPwPlan, [uid]: w.uid }); setAtkTarget(w.owner); setAtkWalker(w.uid); } }
  }
  const attackAll = () => { if (!g || curAtkTarget === undefined) return; const p = { ...atkPlan }; for (const c of me!.battlefield) if (canAttack(g, c) && p[c.uid] === undefined && power(g, c) > 0) p[c.uid] = curAtkTarget; setAtkPlan(p); if (atkWalker !== null && findCard(g, atkWalker)?.owner === curAtkTarget) { const pw = { ...atkPwPlan }; for (const u of Object.keys(p)) if (atkPlan[+u] === undefined) pw[+u] = atkWalker; setAtkPwPlan(pw); } };
  const confirmAttacks = () => { act(g => { declareAttackers(g, HUMAN, Object.entries(atkPlan).map(([u, d]) => ({ uid: +u, defender: d, pw: atkPwPlan[+u] }))); }); setAtkPlan({}); setAtkPwPlan({}); setAtkWalker(null); };
  const confirmBlocks = () => { act(g => { declareBlockers(g, HUMAN, Object.entries(blkPlan).map(([b, a]) => ({ blocker: +b, attacker: a }))); }); setBlkPlan({}); setSelBlocker(null); };
  const doPass = () => act(g => { pass(g, HUMAN); });
  const endTurn = () => { if (!g) return; setPassUntil(g.turn); act(g => { if (g.priority === HUMAN) pass(g, HUMAN); }); };

  // ---------- prompt + main action ----------
  type Btn = { label: string; run: () => void; key?: string; tone?: string };
  let prompt = ''; let tone = 'you'; let primary: Btn | null = null; const secondary: Btn[] = [];
  if (g && me) {
    const incoming = attackers(g).filter(a => a.attacking === HUMAN);
    const playable = me.hand.filter(c => canPlayLand(g, HUMAN, c) || canCast(g, HUMAN, c)).length + me.command.filter(c => canCast(g, HUMAN, c)).length + me.battlefield.reduce((s, c) => s + (def(c).abilities ?? []).filter((_, i) => canActivate(g, HUMAN, c, i)).length, 0);
    const topDesc = top ? `${top.label} (${g.players[top.controller].name}${top.target ? ` → ${describeTarget(g, top.target)}` : ''})` : '';
    if (!g.started) { prompt = `Opening hand: keep it, or mulligan for a fresh 7 (${me.mulligans === 0 ? 'the first mulligan is free' : `next one bottoms ${me.mulligans}`}).`; primary = { label: 'Keep hand', run: () => act(g => startGame(g)), key: 'Enter' }; if (me.mulligans < 6) secondary.push({ label: 'Mulligan', run: () => act(g => mulligan(g, HUMAN)) }); }
    else if (g.winner !== null) { prompt = g.winner === HUMAN ? '🏆 Victory! Every opponent is out.' : `${g.players[g.winner].name} wins the game.`; tone = 'end'; primary = { label: 'Play again', run: newMatch }; }
    else if (humanDecision) { prompt = `❓ ${humanDecision.src ? `${CARDS[humanDecision.src]?.name}: ` : ''}${humanDecision.text}`; tone = 'target'; }
    else if (flow && flowStage && flowStage !== 'targets') { prompt = `${flowName}: ${flowStage === 'kicker' ? 'kick it?' : flowStage === 'x' ? 'choose X' : 'choose mode(s)'}`; tone = 'target'; }
    else if (flow && curSlot) {
      const n = flowActive.length; const k = flow.ts.length + 1;
      prompt = `${flow.kind === 'trigger' ? '⚡ Your trigger' : '🎯'} ${flowName}: choose ${curSlot.label ?? 'a target'}${n > 1 ? ` (target ${k} of ${n})` : ''}${curSlot.who === 'card' ? ' from a graveyard' : ''}. Legal targets glow green.`;
      tone = 'target';
      if (curSlot.opt) secondary.push({ label: 'Skip (no target)', run: skipSlot });
      if (flow.kind !== 'trigger') secondary.push({ label: 'Cancel', run: () => setPending(null), key: 'Esc' });
    }
    else if (blocking) { const dmg = incoming.reduce((s, a) => s + power(g, a), 0); prompt = `⚠ ${incoming.length} attacker${incoming.length > 1 ? 's' : ''}, ${dmg} damage coming at you. ${selBlocker !== null ? 'Now click the attacker to block.' : 'Drag your creatures onto attackers to block (several can block one). Right-click or drag off to unassign.'}`; tone = 'danger'; const n = Object.keys(blkPlan).length; primary = { label: n ? `Confirm ${n} block${n > 1 ? 's' : ''}${short.length ? ' ⚠' : ''}` : 'No blocks', run: confirmBlocks, key: 'Enter' }; }
    else if (declaring) { const n = Object.keys(atkPlan).length; prompt = `⚔ Attack: click an opponent to aim (now: ${curAtkTarget !== undefined ? g.players[curAtkTarget].name : '-'}), then click your glowing creatures, or drag them onto an opponent.`; primary = { label: n ? `Attack with ${n}` : 'No attack', run: confirmAttacks, key: 'Enter', tone: n ? 'attack' : undefined }; secondary.push({ label: `All → ${curAtkTarget !== undefined ? g.players[curAtkTarget].name : ''}`, run: attackAll, key: 'A' }); }
    else if (myPriority && top) { prompt = `🔔 You have priority. Respond with an instant or ability, or pass. Top: ${topDesc}`; tone = 'prio'; primary = { label: 'Pass ▸ Resolve', run: doPass }; }
    else if (myPriority && myTurn && inMain) {
      prompt = `${g.step === 'main1' ? 'Main phase' : 'Second main phase'}: ${me.landPlayed ? 'land played' : me.hand.some(c => isType(c, 'Land')) ? 'play a land' : 'no land in hand'}${playable ? ` · ${playable} playable (glowing)` : ' · nothing affordable'}.`;
      if (g.step === 'main1') { primary = { label: 'To combat ⚔', run: doPass }; secondary.push({ label: 'End turn', run: endTurn, key: 'E' }); } else primary = { label: 'End turn', run: endTurn };
    }
    else if (myPriority) { prompt = `🔔 You have priority (${STEP_LABEL[g.step]}, ${poss(g, g.active)} turn). You can cast an instant or use an ability.`; tone = 'prio'; primary = { label: 'Pass', run: doPass }; }
    else if (me.lost) { prompt = 'You were eliminated. Watching the AI finish the game.'; tone = 'end'; }
    else { const who = g.priority !== null ? g.players[g.priority].name : g.players[g.active].name; prompt = top ? `${who} is considering a response to ${topDesc}…` : `${g.active === HUMAN ? 'Your' : `${g.players[g.active].name}'s`} turn · ${STEP_LABEL[g.step]}`; tone = 'wait'; }
  }

  // ---------- keyboard ----------
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'SELECT' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'f') { toggleFs(); return; }
    if (k === '?' || k === 'h') { setModal(modal === 'help' ? null : 'help'); return; }
    if (k === 'escape') { if (modal) setModal(null); else { clearSel(); setAtkPlan({}); setBlkPlan({}); } return; }
    if (modal || !g) return;
    if (k === 'l') setLogOpen(o => !o);
    if (k === ' ' ) { e.preventDefault(); primary?.run(); }
    if (k === 'enter' && primary?.key === 'Enter') { e.preventDefault(); primary.run(); }
    if (k === 'e') secondary.find(b => b.key === 'E')?.run() ?? (primary?.label === 'End turn' ? primary.run() : undefined);
    if (k === 'a' && declaring) attackAll();
  };
  useEffect(() => { const f = (e: KeyboardEvent) => keyRef.current(e); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, []);

  // ---------- setup screen ----------
  if (!g || !me) return (
    <div className="setup">
      <button className="fsbtn" onClick={toggleFs} title="Full screen (F)">{fs ? '⤡' : '⛶'} Full screen</button>
      <h1>Commander Arena</h1>
      <p className="sub">Four-player free-for-all Commander: you against three AI opponents. 40 life · 21 commander damage · commander tax · stack &amp; priority</p>
      <h3 className="dsec">Precon decks</h3>
      <div className="deckpick">{DECKS.slice(0, 4).map(d => { const c = CARDS[d.commander]; return (
        <button key={d.id} className={`deckopt ${deck === d.id ? 'on' : ''}`} onClick={() => setDeck(d.id)} onDoubleClick={newMatch}>
          <div className="dimg"><CardFace d={c} /></div><b>{d.name}</b><span>{c.name}</span><small>{c.text.split('\n').slice(-1)[0]}</small></button>); })}</div>
      <h3 className="dsec">My decks <span className="muted">({saved.length})</span></h3>
      <div className="deckpick mine">
        {saved.map(d => { const c = CARDS[d.commander]; const lim = d.stats.limited; return (
          <div key={d.id} className={`deckopt saved ${deck === d.id ? 'on' : ''}`} onClick={() => setDeck(d.id)} onDoubleClick={newMatch} data-deck={d.id}>
            <div className="dart" style={{ backgroundImage: d.art ? `url(${d.art})` : undefined }}>{!d.legal && <span className="dtag casual" title="Not Commander-legal; saved for casual play">Casual</span>}</div>
            <b title={d.name}>{d.name}</b><span>{c?.name}</span>
            <small>{d.cards.length + 1} cards · {d.colors.join('') || 'C'}{lim ? <> · <span className="limtag" title="Cards whose rules text is simplified">{lim} limited</span></> : ' · fully supported'}{d.stats.swapped ? ` · ${d.stats.swapped} swapped` : ''}</small>
            <div className="dacts" onClick={e => e.stopPropagation()}>
              <button title="Rename" onClick={() => { const n = window.prompt("Rename deck", d.name); if (n?.trim()) setSaved(decks.renameDeck(d.id, n.trim())); }}>✎ Rename</button>
              <button title="Export as text (copies to clipboard and downloads)" onClick={() => { const t = decks.exportText(d); navigator.clipboard?.writeText(t).catch(() => {}); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain' })); a.download = d.name.replace(/[^\w -]+/g, '') + '.txt'; a.click(); }}>⤓ Export</button>
              <button title="Delete" onClick={() => { if (window.confirm(`Delete "${d.name}"?`)) { setSaved(decks.deleteDeck(d.id)); if (deck === d.id) setDeck(DECKS[0].id); } }}>🗑</button>
            </div>
          </div>); })}
        <button className="deckopt addnew" onClick={() => setModal('import')}><span className="plus">＋</span><b>Import deck</b><small>Paste a list or load a .txt / .dek file</small></button>
      </div>
      <div className="setopts"><label>AI opponents use <select value={aiDecks} onChange={e => { setAiDecks(e.target.value as 'precon' | 'mine'); localStorage.setItem('ca_ai_decks', e.target.value); }}>
        <option value="precon">the precon decks</option><option value="mine" disabled={saved.length < 1}>my imported decks (random), then precons</option></select></label></div>
      <button className="big" onClick={newMatch}>Start game ▶</button>
      {modal === 'import' && <ImportDialog close={() => setModal(null)} art={img => img ? <img className="cimg" src={img} alt="" /> : <div className="frame" />} saved={d => { setSaved(decks.saveDeck(d)); setDeck(d.id); setModal(null); }} />}
      <p className="credit">Card images &amp; data courtesy of Scryfall. Magic: The Gathering is © Wizards of the Coast. Unofficial fan project.</p>
    </div>
  );

  // ---------- table ----------
  const dragSrc = bdrag?.moved ? bdrag.uid : selBlocker;
  const why = (c: Card): string | null => {
    if (!blocking || c.attacking !== HUMAN) return null;
    const full = bdrag?.moved ? bdrag.over === c.uid : false; // full reason only on the hovered attacker
    if (dragSrc !== null) { const r = blockReason(g, findCard(g, dragSrc)!, c); if (r) return '✕ ' + (full ? r : r.split(':')[0]); }
    if (short.includes(c.uid)) return full || dragSrc === null ? '⚠ Menace: add 1 more blocker' : '⚠ Menace';
    if (dragSrc !== null) return hasKw(c, 'menace') && !Object.values(blkPlan).includes(c.uid) ? (full ? '✓ Menace: needs 2+ blockers' : '✓ Menace') : (full ? '✓ Drop to block' : '✓');
    return null;
  };
  const permCls = (c: Card) => {
    const out: string[] = [];
    if (atkPlan[c.uid] !== undefined || blkPlan[c.uid] !== undefined) out.push('planned');
    if (selBlocker === c.uid) out.push('selected');
    if (isTarget({ card: c.uid })) out.push('targetable');
    if (declaring && canAttack(g, c) && atkPlan[c.uid] === undefined) out.push('canact');
    if (blocking && c.owner === HUMAN && isType(c, 'Creature') && !c.tapped && blkPlan[c.uid] === undefined && dragSrc === null) out.push('canact');
    if (blocking && dragSrc !== null && c.attacking === HUMAN) out.push(blockReason(g, findCard(g, dragSrc)!, c) ? 'badtarget' : 'targetable');
    if (bdrag?.moved && bdrag.over === c.uid) out.push('dragover');
    if (bdrag?.uid === c.uid && bdrag.moved) out.push('dragging');
    return out.join(' ');
  };
  const ui: UI = { canTapMana, tapMana, g, blockDown, blockCtx, why, setHover, clickPerm, permCls, activateAb, isTarget, dropOn, dragStart, clickPlayer, atkPlan, atkPw: atkPwPlan, atkWalker, atkTarget: curAtkTarget, declaring, openZone: (pid, zone) => setModal({ pid, zone }), clickCommand: clickHand };
  const hand = me.hand; const n = hand.length;

  return (
    <div className={`app ${anim ? 'anim' : 'noanim'} ${logOpen ? 'logopen' : 'logclosed'}`}>
      <header>
        <b className="logo">Commander Arena</b>
        <div className="turninfo" style={{ borderColor: PCOLORS[g.active] }}>Turn {Math.ceil(g.turn / 4) || 1}<small> ({g.turn})</small> · <b style={{ color: PCOLORS[g.active] }}>{g.active === HUMAN ? 'Your turn' : `${g.players[g.active].name}'s turn`}</b></div>
        <div className="phasebar">{SHOWN_STEPS.map(s => <span key={s} className={`ph ${s === g.step || (s === 'damage' && g.step === 'firstStrike') ? 'cur' : ''} ${STEPS.indexOf(s) < STEPS.indexOf(g.step) ? 'done' : ''}`}>{STEP_LABEL[s]}</span>)}</div>
        {passUntil === g.turn && <span className="autopass">⏩ Auto-passing this turn</span>}
        {stopAll && <span className="autopass hold">✋ Holding priority</span>}
        <button className="ghost" onClick={() => setModal('settings')} title="Settings">⚙ Settings</button>
        <button className="ghost" onClick={() => setModal('help')} title="Keyboard shortcuts (?)">⌨ Keys</button>
        <button className="ghost" onClick={toggleFs} title="Full screen (F)">{fs ? '⤡ Exit full screen' : '⛶ Full screen'}</button>
        <button className="ghost" onClick={() => { gref.current = null; bump(); }}>Quit</button>
      </header>

      <main className="table">
        <div className="opps">{[1, 2, 3].map(i => <OppPanel key={i} ui={ui} pid={i} />)}</div>
        <div className={`prompt ${tone}`}><span>{prompt}</span></div>
        <section className={`player me ${g.active === HUMAN ? 'active' : ''} ${isTarget({ player: HUMAN }) ? 'targetable' : ''}`} style={{ ['--pc' as string]: PCOLORS[0] }} data-player={HUMAN}
          onClick={() => isTarget({ player: HUMAN }) && targetClick({ player: HUMAN })} onDragOver={e => { if (isTarget({ player: HUMAN })) e.preventDefault(); }} onDrop={e => dropOn({ player: HUMAN }, e)}>
          <div className="meside"><PlayerHeader ui={ui} pid={HUMAN} big /><CmdDamage g={g} pid={HUMAN} /><Emblems g={g} pid={HUMAN} /></div>
          <Battlefield ui={ui} pid={HUMAN} />
        </section>
        <div className="hand" style={{ ['--n' as string]: n }}>
          {hand.map((c, i) => { const ok = canPlayLand(g, HUMAN, c) || canCast(g, HUMAN, c); const off = i - (n - 1) / 2; return (
            <div key={c.uid} className={`hcard ${ok ? 'playable' : ''} ${pending?.uid === c.uid ? 'selected' : ''}`} style={{ ['--r' as string]: `${off * Math.min(4, 24 / Math.max(n, 1))}deg`, ['--y' as string]: `${Math.abs(off) * Math.abs(off) * 0.25}vh`, zIndex: i + 1 }}
              draggable={ok && spellSlots(def(c)).length > 0} onDragStart={e => dragStart(c, e)} onDragEnd={() => { /* keep pending if not dropped on target */ }}
              onClick={() => clickHand(c)} onMouseEnter={() => setHover({ id: c.id })} onMouseLeave={() => setHover(null)}>
              <div className="hinner"><CardFace d={def(c)} /></div>
              {(def(c).abilities ?? []).some(a => a.zone === 'hand') && <div className="handab">{(def(c).abilities ?? []).map((a, i) => a.zone === 'hand' ? <button key={i} data-handab={i} disabled={!canActivate(g, HUMAN, c, i)} title={a.label} onClick={e => { e.stopPropagation(); activateAb(c, i); }}>{abCost(a)}: {a.label.length > 22 ? a.label.slice(0, 20) + '…' : a.label}</button> : null)}</div>}
            </div>); })}
        </div>
        {(() => { const gy = [...me.graveyard, ...me.exile].flatMap(c => [
          ...(castZone(g, HUMAN, c) && canCast(g, HUMAN, c) ? [<button key={`c${c.uid}`} data-gycast={c.uid} onClick={() => startCast(c)} onMouseEnter={() => setHover({ id: c.id })} onMouseLeave={() => setHover(null)}>{castZone(g, HUMAN, c) === 'flashback' ? '↺ Flashback' : '▶ Cast'} {def(c).name}</button>] : []),
          ...(def(c).abilities ?? []).map((a, i) => a.zone === 'graveyard' && canActivate(g, HUMAN, c, i) ? <button key={`a${c.uid}-${i}`} onClick={() => activateAb(c, i)} onMouseEnter={() => setHover({ id: c.id })} onMouseLeave={() => setHover(null)}>🪦 {def(c).name}: {abCost(a)}</button> : null).filter(Boolean)]);
          return gy.length ? <div className="gyplay">{gy}</div> : null; })()}
        <StackView g={g} ui={ui} />
        <div className="actionbar">
          {secondary.map(b => <button key={b.label} className="sec" onClick={b.run}>{b.label}{b.key && <kbd>{b.key}</kbd>}</button>)}
          <button className={`primary ${primary ? '' : 'waiting'} ${primary?.tone ?? tone}`} disabled={!primary} onClick={() => primary?.run()}>
            {primary ? <>{primary.label}<kbd>Space</kbd></> : <span className="spin">Waiting…</span>}
          </button>
        </div>
      </main>

      <aside>
        <Preview g={g} h={hover} />
        <div className="logwrap">
          <button className="loghead" onClick={() => setLogOpen(o => !o)}>Game log <span>{logOpen ? '▾ hide (L)' : '▸ show (L)'}</span></button>
          {logOpen && <div className="log" ref={el => { if (el) el.scrollTop = el.scrollHeight; }}>
            {g.log.slice(-150).map((l, i) => { const m = l.match(/^T(\d+) (.*)$/); const txt = m ? m[2] : l; const pl = g.players.find(p => txt.startsWith(p.name)); return (
              <div key={i} className={`le ${txt.startsWith('---') ? 'turnsep' : ''} ${/loses|wins/.test(txt) ? 'big' : ''} ${txt.startsWith('⚡') ? 'trig' : ''} ${/countered|fizzles/.test(txt) ? 'ctr' : ''}`} style={pl ? { borderLeftColor: PCOLORS[pl.id] } : undefined}>{youGrammar(txt.replace(/---/g, '').trim())}</div>); })}
          </div>}
        </div>
      </aside>

      <Arrows g={g} plan={atkPlan} blk={blkPlan} pw={atkPwPlan} />
      {bdrag?.moved && <DragLine uid={bdrag.uid} x={bdrag.x} y={bdrag.y} color={bdrag.over === null ? '#9ec3ff' : blockReason(g, findCard(g, bdrag.uid)!, findCard(g, bdrag.over)!) ? '#ef5350' : '#42a5f5'} />}
      {toast && <div className="toast">{toast}</div>}
      {blockDec && <DecisionDialog key={blockDec.key + blockDec.kind} g={g} d={blockDec} castNow={u => { const c = g.players[HUMAN].exile.find(x => x.uid === u); if (c) startCast(c); }} answer={a => act(g => { answerDecision(g, a); })} Face={CardFace} setHover={id => setHover(id ? { id } : null)} />}
      {!blockDec && flow && flowStage === 'kicker' && flowCard && <KickerDialog name={flowName} cost={costText(def(flowCard).kicker!)} cancel={() => setPending(null)} pick={k => begin2({ ...flow, kicked: k }, flowCard)} />}
      {!blockDec && flow && flowStage === 'x' && <XDialog name={flowName} max={flow.kind === 'ability' && flowCard && flowAb?.loyX ? ctr(flowCard, 'loyalty') : flow.kind === 'ability' && flowCard ? maxX(g, HUMAN, flowCard, { abil: flowAb!.mana, exclude: flowAb!.tap ? flowCard.uid : undefined }) : flowCard ? maxX(g, HUMAN, flowCard, { kicked: flow.kicked }) : 0} cancel={() => setPending(null)} pick={x => advance({ ...flow, x })} />}
      {!blockDec && flow && flowStage === 'modes' && flowModes && <ModesDialog key={flow.uid} name={flowName} m={flowModes} avail={flowModes.list.map(md => (md.tslots ?? []).every(sl => sl.opt || [...g.players.map(q => ({ player: q.id })), ...g.players.flatMap(q => [...q.battlefield, ...q.graveyard].map(c => ({ card: c.uid }))), ...g.stack.map(it => ({ stack: it.id }))].some(t => validSlot(g, HUMAN, sl, t, tctx))))} cancel={flow.kind === 'trigger' ? undefined : () => setPending(null)} pick={ms => advance({ ...flow, modes: ms })} />}
      {!blockDec && curSlot?.who === 'card' && (() => { const cands = g.players.flatMap(q => [...q.graveyard]).filter(c => validSlot(g, HUMAN, curSlot, { card: c.uid }, tctx)); return (
        <div className="modal choice"><div className="mbox wide" data-dialog="gytarget"><h2>{flowName}: choose {curSlot.label ?? 'a card'}</h2><p className="csub">Target a card in a graveyard.</p>
          <div className="zgrid pickgrid">{cands.map(c => <div key={c.uid} className="zcard pick" data-pick={c.uid} onClick={() => targetClick({ card: c.uid })} onMouseEnter={() => setHover({ id: c.id })} onMouseLeave={() => setHover(null)}><CardFace d={def(c)} /><span className="pickn">{g.players[c.owner].name}</span></div>)}</div>
          <div className="cbtns">{curSlot.opt && <button className="sec" onClick={skipSlot}>Skip</button>}{flow!.kind !== 'trigger' && <button className="sec" onClick={() => setPending(null)}>Cancel</button>}</div></div></div>); })()}

      {modal && typeof modal === 'object' && <ZoneViewer g={g} pid={modal.pid} zone={modal.zone} close={() => setModal(null)} setHover={setHover} />}
      {modal === 'help' && <div className="modal" onClick={() => setModal(null)}><div className="mbox" onClick={e => e.stopPropagation()}>
        <h2>Keyboard shortcuts<button className="x" onClick={() => setModal(null)}>✕</button></h2>
        <table className="keys"><tbody>{SHORTCUTS.map(([k, v]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>)}</tbody></table>
        <h3>Mouse</h3><p className="muted">Click glowing cards to play them. Targets glow green. You can drag a targeted spell from your hand onto its target, drag an attacker onto an opponent, or drag a blocker onto an attacking creature (right-click a blocker to unassign it). Hover anything for a large preview. Click 🪦 or ⛔ to view a graveyard or exile.</p>
      </div></div>}
      {modal === 'settings' && <div className="modal" onClick={() => setModal(null)}><div className="mbox" onClick={e => e.stopPropagation()}>
        <h2>Settings<button className="x" onClick={() => setModal(null)}>✕</button></h2>
        <label className="setrow">AI speed <select value={speed} onChange={e => setSpeed(+e.target.value)}><option value={1100}>Slow</option><option value={600}>Normal</option><option value={200}>Fast</option><option value={40}>Instant</option></select></label>
        <label className="setrow"><input type="checkbox" checked={!stopAll} onChange={e => setStopAll(!e.target.checked)} /> Smart auto-pass <small>Only stop when you can respond, something targets you, or it's your main phase</small></label>
        <label className="setrow"><input type="checkbox" checked={stopAll} onChange={e => setStopAll(e.target.checked)} /> Hold priority <small>Stop at every priority point, including on your own spells</small></label>
        <label className="setrow"><input type="checkbox" checked={anim} onChange={e => setAnim(e.target.checked)} /> Animations</label>
        <button className="sec" onClick={() => setModal('tips')}>Show tips again</button>
      </div></div>}
      {modal === 'tips' && <div className="modal tips"><div className="mbox">
        <h2>Quick tips</h2>
        <ul className="tiplist">{TIPS.map(([i, t]) => <li key={t}><span>{i}</span>{t}</li>)}</ul>
        <button className="big" onClick={() => { localStorage.setItem('ca_tips_seen', '1'); setModal(null); }}>Got it, let's play</button>
      </div></div>}
    </div>
  );
}
