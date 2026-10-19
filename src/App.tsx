import { DragEvent, useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { Game, Card, CardDef, Target, TargetSpec, StackItem, Cost, newGame, startGame, mulligan, def, isType, hasKw, power, toughness, costOf, canCast, canPlayLand, castSpell, playLand, validTarget, canAttack, declareAttackers, declareBlockers, attackers, canBlock, opponents, findCard, COLORS, STEPS, DECKS, CARDS, manaAvailable, pass, activate, canActivate, chooseTriggerTarget, describeTarget, defenders, isCommander } from './engine/engine';
import { tick, waitingForHuman, shouldAutoPass, PassOpts } from './engine/controller';

const HUMAN = 0;
const PCOLORS = ['#4fc3f7', '#ef5350', '#ffb300', '#66bb6a'];
export const costStr = (c: Cost) => `${c.generic ? `{${c.generic}}` : ''}${COLORS.map(k => `{${k}}`.repeat(c[k] || 0)).join('')}` || '{0}';
const STEP_LABEL: Record<string, string> = { untap: 'Untap', upkeep: 'Upkeep', draw: 'Draw', main1: 'Main 1', attackers: 'Attack', blockers: 'Block', firstStrike: 'First strike', damage: 'Damage', main2: 'Main 2', end: 'End', cleanup: 'Cleanup' };
const SHOWN_STEPS = STEPS.filter(s => s !== 'untap' && s !== 'cleanup' && s !== 'firstStrike');
const youGrammar = (t: string) => t.replace(/^You's/, 'Your').replace(/You's/g, 'your').replace(/^You (plays|casts|mulligans|loses|gains|discards|wins|activates|sacrifices)/, (_, v: string) => 'You ' + (v === 'mulligans' ? 'mulligan' : v.endsWith('es') && v !== 'loses' && v !== 'sacrifices' && v !== 'activates' ? v.slice(0, -2) : v.slice(0, -1))).replace(/to You\./g, 'to you.').replace(/attacks You\./g, 'attacks you.').replace(/under You's/g, 'under your');
const poss = (g: Game, pid: number) => (pid === HUMAN ? 'your' : `${g.players[pid].name}'s`);
const KW_HELP: Record<string, string> = {
  flying: 'Can only be blocked by creatures with flying or reach.', reach: 'Can block creatures with flying.', trample: 'Combat damage beyond what is lethal to its blockers is dealt to the player.',
  haste: 'Can attack and use {T} abilities the turn it comes under your control.', vigilance: "Attacking doesn't cause it to tap.", lifelink: 'Damage dealt by it also causes you to gain that much life.',
  deathtouch: 'Any amount of damage it deals to a creature is enough to destroy it.', 'first strike': 'Deals combat damage before creatures without first strike.', 'double strike': 'Deals both first-strike and regular combat damage.',
  menace: "Can't be blocked except by two or more creatures.", defender: "Can't attack.", flash: 'You may cast it any time you could cast an instant.', hexproof: "Can't be the target of spells or abilities your opponents control.", prowess: 'Whenever you cast a noncreature spell, it gets +1/+1 until end of turn.',
};
const abCost = (a: { tap?: boolean; mana?: Cost; sac?: boolean }) => [a.mana ? costStr(a.mana) : '', a.tap ? '{T}' : '', a.sac ? 'Sac' : ''].filter(Boolean).join(', ');
type PendingAct = { kind: 'cast'; uid: number } | { kind: 'ability'; uid: number; idx: number };
type Hover = { id: string; uid?: number } | null;
type Modal = null | 'settings' | 'help' | 'tips' | { pid: number; zone: 'graveyard' | 'exile' };

function ManaCost({ c }: { c: Cost }) {
  return <span className="mcost">{c.generic ? <i className="pip pip-C">{c.generic}</i> : null}{COLORS.flatMap(k => Array.from({ length: c[k] || 0 }, (_, i) => <i key={k + i} className={`pip pip-${k}`}>{k}</i>))}</span>;
}
/** Card face: Scryfall image, with a readable text frame if the image fails. */
function CardFace({ d }: { d: CardDef }) {
  const [failed, setFailed] = useState(false);
  if (d.img && !failed) return <img className="cimg" src={d.img} alt={d.name} draggable={false} onError={() => setFailed(true)} />;
  return (
    <div className={`frame f-${d.colors.join('') || 'C'}`}>
      <div className="fname"><span>{d.name}</span><ManaCost c={d.cost} /></div><div className="fart" />
      <div className="ftype">{d.typeLine ?? d.types.join(' ')}</div><div className="ftext">{d.text}</div>
      {d.power !== undefined && <div className="fpt">{d.power}/{d.toughness}</div>}
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
  isTarget: (t: Target) => boolean; dropOn: (t: Target, e: DragEvent) => void; dragStart: (c: Card, e: DragEvent) => void;
  clickPlayer: (pid: number) => void; atkPlan: Record<number, number>; atkTarget?: number; declaring: boolean; openZone: (pid: number, zone: 'graveyard' | 'exile') => void; clickCommand: (c: Card) => void;
}

function Permanent({ ui, c }: { ui: UI; c: Card }) {
  const { g } = ui; const d = def(c); const cr = isType(c, 'Creature'); const mine = c.owner === HUMAN;
  const sick = cr && c.sick && !hasKw(c, 'haste') && c.owner === g.active;
  const atkTo = c.attacking ?? ui.atkPlan[c.uid];
  const abs = mine ? (d.abilities ?? []).map((a, i) => ({ a, i, ok: canActivate(g, HUMAN, c, i) })) : [];
  const t = { card: c.uid };
  return (
    <div className={`slot ${c.tapped ? 'tapped' : ''}`} data-uid={c.uid}
      onDragOver={e => { if (ui.isTarget(t)) e.preventDefault(); }} onDrop={e => ui.dropOn(t, e)}>
      <div className={`perm ${c.attacking !== undefined ? 'attacking' : ''} ${c.blocking !== undefined ? 'blocking' : ''} ${ui.permCls(c)}`}
        draggable={mine && ui.declaring && canAttack(g, c)} onDragStart={e => ui.dragStart(c, e)}
        onClick={() => ui.clickPerm(c)} onMouseEnter={() => ui.setHover({ id: c.id, uid: c.uid })} onMouseLeave={() => ui.setHover(null)}>
        <CardFace d={d} />
        {cr && <span className={`pt ${c.damage ? 'hurt' : ''} ${c.pp || c.pt ? 'pumped' : ''}`} title={`Power/toughness${c.damage ? ` (${c.damage} damage marked)` : ''}`}>{power(g, c)}/{toughness(g, c) - c.damage}</span>}
        {sick && <span className="badge sick" title="Summoning sick: can't attack or use {T} abilities this turn">💤</span>}
        {atkTo !== undefined && <span className="badge atk" style={{ background: PCOLORS[atkTo] }}>⚔ {g.players[atkTo].name}</span>}
        {c.blocking !== undefined && <span className="badge blk">🛡 Block</span>}
        {isCommander(g, c) && <span className="badge cmdr" title="Commander">★</span>}
        {abs.length > 0 && <div className="abstrip">{abs.map(({ a, i, ok }) => (
          <button key={i} disabled={!ok} title={`${abCost(a)}: ${a.label}`} onClick={e => { e.stopPropagation(); ui.activateAb(c, i); }}><b>{abCost(a)}</b> {a.label}</button>))}</div>}
      </div>
    </div>
  );
}
function LandRow({ ui, cards }: { ui: UI; cards: Card[] }) {
  const groups = Object.values(cards.reduce((m, c) => ((m[c.id] ??= []).push(c), m), {} as Record<string, Card[]>));
  return <div className="lands">{groups.map(gr => { const d = def(gr[0]); const un = gr.filter(c => !c.tapped).length; return (
    <div key={d.id} className={`landchip ${un ? '' : 'alltapped'}`} onMouseEnter={() => ui.setHover({ id: d.id })} onMouseLeave={() => ui.setHover(null)} title={`${d.name}: ${un} untapped of ${gr.length}`}>
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
  const { g } = ui; const p = g.players[pid]; const cmd = CARDS[p.commanderId]; const inZone = p.command[0];
  const castable = pid === HUMAN && inZone && canCast(g, HUMAN, inZone);
  return (
    <div className={`cmdzone ${castable ? 'playable' : ''} ${inZone ? '' : 'away'}`} onClick={() => inZone && pid === HUMAN && ui.clickCommand(inZone)}
      onMouseEnter={() => ui.setHover({ id: cmd.id })} onMouseLeave={() => ui.setHover(null)} title={`Command zone. Commander tax: +${2 * p.commanderCasts} (each recast costs {2} more)`}>
      <CardFace d={cmd} />
      <span className="tax">TAX +{2 * p.commanderCasts}</span>
      {inZone ? <span className="czcost"><ManaCost c={costOf(g, inZone)} /></span> : <span className="czlabel">{p.battlefield.some(c => c.id === cmd.id) ? 'IN PLAY' : 'AWAY'}</span>}
    </div>
  );
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
        </div>
      </div>
      <LifeTotal v={p.life} big={big} />
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
function OppPanel({ ui, pid }: { ui: UI; pid: number }) {
  const { g } = ui; const p = g.players[pid]; const t = { player: pid };
  const tgt = ui.isTarget(t); const atkSel = ui.declaring && ui.atkTarget === pid;
  return (
    <section className={`player opp ${g.active === pid ? 'active' : ''} ${p.lost ? 'lost' : ''} ${tgt ? 'targetable' : ''} ${atkSel ? 'atktarget' : ''} ${ui.declaring && !p.lost ? 'atkpick' : ''}`} style={{ ['--pc' as string]: PCOLORS[pid] }} data-player={pid}
      onClick={() => ui.clickPlayer(pid)} onDragOver={e => { if (tgt || (ui.declaring && !p.lost)) e.preventDefault(); }} onDrop={e => ui.dropOn(t, e)}>
      <PlayerHeader ui={ui} pid={pid} />
      <CmdDamage g={g} pid={pid} />
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
function Arrows({ g, plan, blk }: { g: Game; plan: Record<number, number>; blk: Record<number, number> }) {
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
        add(q(`[data-uid="${a.uid}"]`), q(`[data-player="${a.attacking}"] .avatar`), PCOLORS[a.attacking!], !!a.blockedBy?.length);
      }
      for (const [u, pid] of Object.entries(plan)) add(q(`[data-uid="${u}"]`), q(`[data-player="${pid}"] .avatar`), PCOLORS[pid], true);
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
  ['🛡', 'When you are attacked, click one of your creatures and then the attacker it should block.'],
  ['📚', 'Spells and abilities go on the stack in the middle of the table. You get priority automatically when you can respond.'],
  ['★', 'Your commander waits in the command zone next to your life total. Every recast costs {2} more.'],
];

export default function App() {
  const gref = useRef<Game | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [deck, setDeck] = useState(DECKS[0].id);
  const [speed, setSpeed] = useState(600);
  const [stopAll, setStopAll] = useState(false);
  const [anim, setAnim] = useState(true);
  const [passUntil, setPassUntil] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingAct | null>(null);
  const [atkTarget, setAtkTarget] = useState<number | null>(null);
  const [atkPlan, setAtkPlan] = useState<Record<number, number>>({});
  const [selBlocker, setSelBlocker] = useState<number | null>(null);
  const [blkPlan, setBlkPlan] = useState<Record<number, number>>({});
  const [hover, setHover] = useState<Hover>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [logOpen, setLogOpen] = useState(true);
  const [fs, setFs] = useState(false);
  const g = gref.current;
  const opts: PassOpts = { stopAll, passUntilTurn: passUntil };

  const act = useCallback((f: (g: Game) => void) => { if (gref.current) { f(gref.current); bump(); } }, []);
  function newMatch() {
    const others = DECKS.map(d => d.id).filter(x => x !== deck);
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
  const pendingCard = g && pending ? (pending.kind === 'cast' ? [...me!.hand, ...me!.command].find(c => c.uid === pending.uid) : me!.battlefield.find(c => c.uid === pending.uid)) : undefined;
  const humanChoice = g?.choice && g.players[g.choice.controller].human ? g.choice : null;
  const spec: TargetSpec | undefined = humanChoice ? humanChoice.trig.target : pending && pendingCard ? (pending.kind === 'cast' ? def(pendingCard).spell?.target : def(pendingCard).abilities?.[pending.idx].target) : undefined;
  const isTarget = (t: Target) => !!g && !!spec && validTarget(g, HUMAN, spec, t);
  const blocking = !!g && g.awaiting === 'block' && defenders(g).includes(HUMAN) && !g.blockersDone.includes(HUMAN) && !me!.lost;
  const declaring = !!g && g.awaiting === 'attack' && g.active === HUMAN && !me!.lost;
  const myPriority = !!g && g.priority === HUMAN && !g.awaiting && !g.choice && g.winner === null && g.started && !shouldAutoPass(g, HUMAN, opts);
  const top = g?.stack[g.stack.length - 1];
  const curAtkTarget = g ? (atkTarget !== null && !g.players[atkTarget].lost && atkTarget !== HUMAN ? atkTarget : opponents(g, HUMAN).sort((a, b) => a.life - b.life)[0]?.id) : undefined;
  const inMain = !!g && (g.step === 'main1' || g.step === 'main2');

  // ---------- actions ----------
  const clearSel = () => { setPending(null); setSelBlocker(null); };
  const targetClick = (t: Target) => {
    if (!g || !isTarget(t)) return false;
    if (humanChoice) { act(g => { chooseTriggerTarget(g, t); }); return true; }
    if (!pending) return false;
    act(g => { if (pending.kind === 'cast') castSpell(g, HUMAN, pending.uid, t); else activate(g, HUMAN, pending.uid, pending.idx, t); }); setPending(null); return true;
  };
  function clickHand(c: Card) {
    if (!g) return;
    if (canPlayLand(g, HUMAN, c)) return act(g => playLand(g, HUMAN, c.uid));
    if (!canCast(g, HUMAN, c)) return;
    if (def(c).spell?.target) setPending({ kind: 'cast', uid: c.uid }); else act(g => castSpell(g, HUMAN, c.uid));
  }
  function activateAb(c: Card, i: number) {
    if (!g || !canActivate(g, HUMAN, c, i)) return;
    if (def(c).abilities![i].target) setPending({ kind: 'ability', uid: c.uid, idx: i }); else act(g => activate(g, HUMAN, c.uid, i));
  }
  function toggleAttacker(c: Card, to = curAtkTarget) {
    const p = { ...atkPlan }; if (p[c.uid] !== undefined && to === p[c.uid]) delete p[c.uid]; else if (canAttack(g!, c) && to !== undefined) p[c.uid] = to; setAtkPlan(p);
  }
  function clickPerm(c: Card) {
    if (!g) return;
    if (spec) { targetClick({ card: c.uid }); return; }
    if (declaring && c.owner === HUMAN) return toggleAttacker(c);
    if (blocking) {
      if (c.owner === HUMAN && isType(c, 'Creature') && !c.tapped) { if (blkPlan[c.uid] !== undefined) { const p = { ...blkPlan }; delete p[c.uid]; setBlkPlan(p); } else setSelBlocker(selBlocker === c.uid ? null : c.uid); return; }
      if (c.attacking === HUMAN && selBlocker !== null) { const b = findCard(g, selBlocker)!; if (canBlock(g, b, c)) setBlkPlan({ ...blkPlan, [selBlocker]: c.uid }); setSelBlocker(null); }
    }
  }
  function clickPlayer(pid: number) { if (spec) { targetClick({ player: pid }); return; } if (declaring && !g!.players[pid].lost && pid !== HUMAN) setAtkTarget(pid); }
  function dragStart(c: Card, e: DragEvent) {
    e.dataTransfer.setData('text/plain', String(c.uid)); e.dataTransfer.effectAllowed = 'move';
    if (!declaring && c.owner === HUMAN && me!.hand.includes(c) && def(c).spell?.target && canCast(g!, HUMAN, c)) setPending({ kind: 'cast', uid: c.uid });
  }
  function dropOn(t: Target, e: DragEvent | null) {
    e?.preventDefault?.();
    if (spec) { targetClick(t); return; }
    const uid = Number(e?.dataTransfer?.getData('text/plain'));
    if (declaring && t.player !== undefined && uid) { const c = me!.battlefield.find(x => x.uid === uid); if (c && canAttack(g!, c)) { setAtkPlan({ ...atkPlan, [uid]: t.player }); setAtkTarget(t.player); } }
  }
  const attackAll = () => { if (!g || curAtkTarget === undefined) return; const p = { ...atkPlan }; for (const c of me!.battlefield) if (canAttack(g, c) && p[c.uid] === undefined && power(g, c) > 0) p[c.uid] = curAtkTarget; setAtkPlan(p); };
  const confirmAttacks = () => { act(g => { declareAttackers(g, HUMAN, Object.entries(atkPlan).map(([u, d]) => ({ uid: +u, defender: d }))); }); setAtkPlan({}); };
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
    else if (humanChoice) { prompt = `⚡ Your trigger: ${CARDS[humanChoice.sourceId].name}, ${humanChoice.trig.label}. Choose a target (it's required).`; tone = 'target'; }
    else if (pendingCard && spec) { prompt = `🎯 Choose a target for ${def(pendingCard).name}: ${spec.toLowerCase().endsWith('spell') ? 'a spell on the stack' : spec === 'any' ? 'a creature or an opponent/player' : 'a creature'} (highlighted in green).`; tone = 'target'; secondary.push({ label: 'Cancel', run: () => setPending(null), key: 'Esc' }); }
    else if (blocking) { const dmg = incoming.reduce((s, a) => s + power(g, a), 0); prompt = `⚠ ${incoming.length} attacker${incoming.length > 1 ? 's' : ''}, ${dmg} damage coming at you. ${selBlocker !== null ? 'Now click the attacker to block.' : 'Click your creature, then the attacker it should block.'}`; tone = 'danger'; const n = Object.keys(blkPlan).length; primary = { label: n ? `Confirm ${n} block${n > 1 ? 's' : ''}` : 'No blocks', run: confirmBlocks, key: 'Enter' }; }
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
      <div className="deckpick">{DECKS.map(d => { const c = CARDS[d.commander]; return (
        <button key={d.id} className={`deckopt ${deck === d.id ? 'on' : ''}`} onClick={() => setDeck(d.id)} onDoubleClick={newMatch}>
          <div className="dimg"><CardFace d={c} /></div><b>{d.name}</b><span>{c.name}</span><small>{c.text.split('\n').slice(-1)[0]}</small></button>); })}</div>
      <button className="big" onClick={newMatch}>Start game ▶</button>
      <p className="credit">Card images &amp; data courtesy of Scryfall. Magic: The Gathering is © Wizards of the Coast. Unofficial fan project.</p>
    </div>
  );

  // ---------- table ----------
  const permCls = (c: Card) => {
    const out: string[] = [];
    if (atkPlan[c.uid] !== undefined || blkPlan[c.uid] !== undefined) out.push('planned');
    if (selBlocker === c.uid) out.push('selected');
    if (isTarget({ card: c.uid })) out.push('targetable');
    if (declaring && canAttack(g, c) && atkPlan[c.uid] === undefined) out.push('canact');
    if (blocking && c.owner === HUMAN && isType(c, 'Creature') && !c.tapped && blkPlan[c.uid] === undefined && selBlocker === null) out.push('canact');
    if (blocking && selBlocker !== null && c.attacking === HUMAN && canBlock(g, findCard(g, selBlocker)!, c)) out.push('targetable');
    return out.join(' ');
  };
  const ui: UI = { g, setHover, clickPerm, permCls, activateAb, isTarget, dropOn, dragStart, clickPlayer, atkPlan, atkTarget: curAtkTarget, declaring, openZone: (pid, zone) => setModal({ pid, zone }), clickCommand: clickHand };
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
          <div className="meside"><PlayerHeader ui={ui} pid={HUMAN} big /><CmdDamage g={g} pid={HUMAN} /></div>
          <Battlefield ui={ui} pid={HUMAN} />
        </section>
        <div className="hand" style={{ ['--n' as string]: n }}>
          {hand.map((c, i) => { const ok = canPlayLand(g, HUMAN, c) || canCast(g, HUMAN, c); const off = i - (n - 1) / 2; return (
            <div key={c.uid} className={`hcard ${ok ? 'playable' : ''} ${pending?.uid === c.uid ? 'selected' : ''}`} style={{ ['--r' as string]: `${off * Math.min(4, 24 / Math.max(n, 1))}deg`, ['--y' as string]: `${Math.abs(off) * Math.abs(off) * 0.25}vh`, zIndex: i + 1 }}
              draggable={ok && !!def(c).spell?.target} onDragStart={e => dragStart(c, e)} onDragEnd={() => { /* keep pending if not dropped on target */ }}
              onClick={() => clickHand(c)} onMouseEnter={() => setHover({ id: c.id })} onMouseLeave={() => setHover(null)}>
              <div className="hinner"><CardFace d={def(c)} /></div>
            </div>); })}
        </div>
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

      <Arrows g={g} plan={atkPlan} blk={blkPlan} />

      {modal && typeof modal === 'object' && <ZoneViewer g={g} pid={modal.pid} zone={modal.zone} close={() => setModal(null)} setHover={setHover} />}
      {modal === 'help' && <div className="modal" onClick={() => setModal(null)}><div className="mbox" onClick={e => e.stopPropagation()}>
        <h2>Keyboard shortcuts<button className="x" onClick={() => setModal(null)}>✕</button></h2>
        <table className="keys"><tbody>{SHORTCUTS.map(([k, v]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>)}</tbody></table>
        <h3>Mouse</h3><p className="muted">Click glowing cards to play them. Targets glow green. You can drag a targeted spell from your hand onto its target, or drag an attacker onto an opponent. Hover anything for a large preview. Click 🪦 or ⛔ to view a graveyard or exile.</p>
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
