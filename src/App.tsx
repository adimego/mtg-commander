import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { Game, Card, CardDef, Target, TargetSpec, StackItem, newGame, startGame, mulligan, def, isType, hasKw, power, toughness, costOf, canCast, canPlayLand, castSpell, playLand, validTarget, canAttack, declareAttackers, declareBlockers, attackers, canBlock, opponents, findCard, Cost, COLORS, STEPS, DECKS, CARDS, manaAvailable, pass, activate, canActivate, chooseTriggerTarget, describeTarget, defenders } from './engine/engine';
import { tick, waitingForHuman, shouldAutoPass, PassOpts } from './engine/controller';

const HUMAN = 0;
export const costStr = (c: Cost) => `${c.generic ? `{${c.generic}}` : ''}${COLORS.map(k => `{${k}}`.repeat(c[k] || 0)).join('')}` || '{0}';
const STEP_LABEL: Record<string, string> = { untap: 'Untap', upkeep: 'Upkeep', draw: 'Draw', main1: 'Main 1', attackers: 'Attack', blockers: 'Block', firstStrike: 'First strike', damage: 'Damage', main2: 'Main 2', end: 'End', cleanup: 'Cleanup' };
const youGrammar = (t: string) => t.replace(/^You's/, 'Your').replace(/You's/g, 'your').replace(/^You's turn/, 'Your turn').replace(/^You (plays|casts|mulligans|loses|gains|discards|wins)/, (_, v: string) => 'You ' + (v === 'mulligans' ? 'mulligan' : v.slice(0, -1))).replace(/to You\./g, 'to you.').replace(/attacks You\./g, 'attacks you.');
const PCOLORS = ['#4fc3f7', '#ef5350', '#ffb300', '#66bb6a'];

function ManaCost({ c }: { c: Cost }) {
  return <span className="mcost">{c.generic ? <i className="pip pip-C">{c.generic}</i> : null}{COLORS.flatMap(k => Array.from({ length: c[k] || 0 }, (_, i) => <i key={k + i} className={`pip pip-${k}`}>{k}</i>))}</span>;
}

/** Card face: Scryfall image, with a readable text frame if the image fails. */
function CardFace({ d, big }: { d: CardDef; big?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (d.img && !failed) return <img className="cimg" src={d.img} alt={d.name} loading="lazy" draggable={false} onError={() => setFailed(true)} />;
  return (
    <div className={`frame f-${d.colors.join('') || 'C'} ${big ? 'big' : ''}`}>
      <div className="fname"><span>{d.name}</span><ManaCost c={d.cost} /></div>
      <div className="fart" />
      <div className="ftype">{d.typeLine ?? d.types.join(' ')}</div>
      <div className="ftext">{d.text}</div>
      {d.power !== undefined && <div className="fpt">{d.power}/{d.toughness}</div>}
    </div>
  );
}

interface UI {
  g: Game; hover: (id: string | null) => void; click: (c: Card) => void; cls: (c: Card) => string;
  clickPlayer: (pid: number) => void; playerTargetable: (pid: number) => boolean;
  atkTarget?: number; setAtkTarget: (pid: number) => void; atkPlan: Record<number, number>;
  activateAb?: (c: Card, i: number) => void;
}
const abCost = (a: { tap?: boolean; mana?: Cost; sac?: boolean }) => [a.mana ? costStr(a.mana) : '', a.tap ? '{T}' : '', a.sac ? 'Sac' : ''].filter(Boolean).join(', ');

function Permanent({ ui, c }: { ui: UI; c: Card }) {
  const { g } = ui; const d = def(c); const cr = isType(c, 'Creature');
  const t = toughness(g, c); const sick = cr && c.sick && !hasKw(c, 'haste') && c.owner === g.active;
  const atkTo = c.attacking ?? ui.atkPlan[c.uid];
  return (
    <div className={`slot ${c.tapped ? 'tapped' : ''} ${ui.activateAb && c.owner === HUMAN && d.abilities ? 'hasab' : ''}`} data-uid={c.uid}>
      <div className={`perm ${c.attacking !== undefined ? 'attacking' : ''} ${c.blocking !== undefined ? 'blocking' : ''} ${ui.cls(c)}`}
        onClick={() => ui.click(c)} onMouseEnter={() => ui.hover(c.id)} onMouseLeave={() => ui.hover(null)}>
        <CardFace d={d} />
        {cr && <span className={`pt ${c.damage ? 'hurt' : ''} ${c.pp || c.pt ? 'pumped' : ''}`}>{power(g, c)}/{t - c.damage}</span>}
        {sick && <span className="badge sick" title="Summoning sick: can't attack this turn">💤</span>}
        {atkTo !== undefined && <span className="badge atk" style={{ background: PCOLORS[atkTo] }}>⚔ {g.players[atkTo].name}</span>}
        {c.blocking !== undefined && <span className="badge blk">🛡 Blocking</span>}
        {c.tapped && <span className="badge tap">TAPPED</span>}
      </div>
      {ui.activateAb && c.owner === HUMAN && (d.abilities ?? []).map((a, i) => (
        <button key={i} className="abbtn" disabled={!canActivate(g, HUMAN, c, i)} title={`${abCost(a)}: ${a.label}`} onClick={e => { e.stopPropagation(); ui.activateAb!(c, i); }}>
          <b>{abCost(a)}</b> {a.label}</button>))}
    </div>
  );
}

function LandGroup({ ui, cards }: { ui: UI; cards: Card[] }) {
  const d = def(cards[0]); const untapped = cards.filter(c => !c.tapped).length;
  return (
    <div className={`landchip ${untapped ? '' : 'alltapped'}`} onMouseEnter={() => ui.hover(d.id)} onMouseLeave={() => ui.hover(null)} title={d.name}>
      <div className="landart" style={{ backgroundImage: `url(${d.art})` }} />
      <span className="landname">{d.name}</span>
      <span className="landcount"><b>{untapped}</b>/{cards.length}</span>
    </div>
  );
}

function PlayerArea({ ui, pid }: { ui: UI; pid: number }) {
  const { g } = ui; const p = g.players[pid]; const me = pid === HUMAN;
  const lands = p.battlefield.filter(c => isType(c, 'Land')); const other = p.battlefield.filter(c => !isType(c, 'Land'));
  const groups = Object.values(lands.reduce((m, c) => ((m[c.id] ??= []).push(c), m), {} as Record<string, Card[]>));
  const cmd = CARDS[p.commanderId]; const inZone = p.command[0];
  const tgt = ui.playerTargetable(pid);
  const isAtkTarget = !me && g.awaiting === 'attack' && g.active === HUMAN && ui.atkTarget === pid;
  return (
    <section className={`player ${g.active === pid ? 'active' : ''} ${p.lost ? 'lost' : ''} ${me ? 'me' : 'opp'} ${tgt ? 'targetable' : ''} ${isAtkTarget ? 'atktarget' : ''}`} style={{ ['--pc' as string]: PCOLORS[pid] }} data-player={pid} onClick={() => tgt && ui.clickPlayer(pid)}>
      <div className="phead">
        <div className="avatar" style={{ backgroundImage: `url(${cmd.art})` }} />
        <div className="pinfo">
          <div className="pname">{p.name}{g.active === pid && <span className="turnchip">ACTIVE</span>}{p.lost && <span className="out">ELIMINATED</span>}</div>
          <div className="pdeck">{p.deckName}</div>
          <div className="counts" title="Hand · Library · Graveyard">✋ {p.hand.length} · 📚 {p.library.length} · 🪦 {p.graveyard.length}{me && <> · 💧 {manaAvailable(p)} mana</>}</div>
        </div>
        <div className={`life ${p.life <= 10 ? 'low' : ''}`} title="Life total">{p.life}</div>
        <div className="cmdzone" onMouseEnter={() => ui.hover(cmd.id)} onMouseLeave={() => ui.hover(null)} onClick={e => { if (me && inZone) { e.stopPropagation(); ui.click(inZone); } }}>
          <div className={`cz ${inZone ? (me && canCast(g, HUMAN, inZone) ? 'playable' : '') : 'empty'}`}>
            <CardFace d={cmd} />
            {!inZone && <span className="czlabel">{p.battlefield.some(c => c.id === cmd.id) ? 'In play' : 'Away'}</span>}
          </div>
          <span className="tax" title="Commander tax">Tax +{2 * p.commanderCasts}</span>
          {inZone && <span className="czcost"><ManaCost c={costOf(g, inZone)} /></span>}
        </div>
      </div>
      <div className="cdmg" title="Commander damage this player has taken from each commander (21 = lose)">
        <span className="lbl">Cmdr dmg taken</span>
        {g.players.filter(o => o.id !== pid).map(o => { const v = p.cmdDamage[o.id] || 0; return (
          <span key={o.id} className={`cd ${v >= 14 ? 'danger' : ''}`} style={{ borderColor: PCOLORS[o.id] }}>
            <i style={{ backgroundImage: `url(${CARDS[o.commanderId].art})` }} />{o.name}: <b>{v}</b>/21</span>); })}
        {!me && g.awaiting === 'attack' && g.active === HUMAN && !p.lost && <button className={`atkbtn ${isAtkTarget ? 'on' : ''}`} onClick={e => { e.stopPropagation(); ui.setAtkTarget(pid); }}>{isAtkTarget ? '🎯 Attacking this player' : 'Attack this player'}</button>}
      </div>
      <div className="bf">{other.length ? other.map(c => <Permanent key={c.uid} ui={ui} c={c} />) : <span className="empty">No creatures or artifacts</span>}</div>
      <div className="lands">{groups.map(gr => <LandGroup key={gr[0].id} ui={ui} cards={gr} />)}</div>
    </section>
  );
}

function CombatArrows({ g, plan, blk, deps }: { g: Game; plan: Record<number, number>; blk: Record<number, number>; deps: unknown }) {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const draw = () => {
      const svg = ref.current; if (!svg) return; const host = svg.parentElement!.getBoundingClientRect();
      const ctr = (el: Element | null, edge = false) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left - host.left + r.width / 2, y: r.top - host.top + (edge ? 30 : r.height / 2) }; };
      const q = (s: string) => svg.parentElement!.querySelector(s);
      const lines: string[] = [];
      const add = (from: Element | null, to: Element | null, color: string, dashed: boolean, edge = false) => {
        const a = ctr(from), b = ctr(to, edge); if (!a || !b) return;
        lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${color}" stroke-width="4" ${dashed ? 'stroke-dasharray="10 6"' : ''} marker-end="url(#ah-${color.slice(1)})" opacity="0.9"/>`);
      };
      for (const a of attackers(g)) {
        const col = PCOLORS[a.attacking!];
        if (a.blockedBy?.length) for (const b of a.blockedBy) add(q(`[data-uid="${b}"]`), q(`[data-uid="${a.uid}"]`), '#42a5f5', false);
        add(q(`[data-uid="${a.uid}"]`), q(`[data-player="${a.attacking}"] .avatar`), col, !!a.blockedBy?.length, false);
      }
      for (const [u, pid] of Object.entries(plan)) add(q(`[data-uid="${u}"]`), q(`[data-player="${pid}"] .avatar`), PCOLORS[pid], true);
      for (const [b, a] of Object.entries(blk)) add(q(`[data-uid="${b}"]`), q(`[data-uid="${a}"]`), '#42a5f5', true);
      const marks = [...PCOLORS, '#42a5f5'].map(c => `<marker id="ah-${c.slice(1)}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${c}"/></marker>`).join('');
      svg.innerHTML = `<defs>${marks}</defs>${lines.join('')}`;
    };
    draw(); const t = setTimeout(draw, 300); window.addEventListener('resize', draw);
    return () => { clearTimeout(t); window.removeEventListener('resize', draw); };
  });
  void deps;
  return <svg ref={ref} className="arrows" />;
}

function StackPanel({ g, onPick, pickable, hover }: { g: Game; onPick: (id: number) => void; pickable: (id: number) => boolean; hover: (id: string | null) => void }) {
  if (!g.stack.length) return null;
  const items = [...g.stack].reverse();
  return (
    <div className="stackpanel">
      <div className="stackhead">THE STACK <span>· top resolves first</span></div>
      {items.map((it: StackItem, i) => (
        <div key={it.id} className={`sitem ${i === 0 ? 'top' : ''} ${pickable(it.id) ? 'targetable' : ''}`} data-stack={it.id} style={{ borderLeftColor: PCOLORS[it.controller] }}
          onClick={() => pickable(it.id) && onPick(it.id)} onMouseEnter={() => hover(it.sourceId)} onMouseLeave={() => hover(null)}>
          <div className="sthumb" style={{ backgroundImage: `url(${CARDS[it.sourceId].art})` }} />
          <div className="sinfo">
            <div><span className={`kind k-${it.kind}`}>{it.kind === 'spell' ? 'SPELL' : it.kind === 'trigger' ? '⚡ TRIGGER' : 'ABILITY'}</span> <b>{it.label}</b></div>
            <div className="smeta"><span style={{ color: PCOLORS[it.controller] }}>{g.players[it.controller].name}</span>{it.target && <> → <b>{describeTarget(g, it.target)}</b></>}{it.uncounterable && ' · can\'t be countered'}</div>
          </div>
          {i === 0 && <span className="next">NEXT</span>}
        </div>))}
    </div>
  );
}

type PendingAct = { kind: 'cast'; uid: number } | { kind: 'ability'; uid: number; idx: number };

export default function App() {
  const gref = useRef<Game | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [deck, setDeck] = useState(DECKS[0].id);
  const [speed, setSpeed] = useState(600);
  const [pending, setPending] = useState<PendingAct | null>(null);
  const [stopAll, setStopAll] = useState(false);
  const [passUntil, setPassUntil] = useState<number | null>(null);
  const [atkTarget, setAtkTarget] = useState<number | null>(null);
  const [atkPlan, setAtkPlan] = useState<Record<number, number>>({});
  const [selBlocker, setSelBlocker] = useState<number | null>(null);
  const [blkPlan, setBlkPlan] = useState<Record<number, number>>({});
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const g = gref.current;

  function newMatch() {
    const others = DECKS.map(d => d.id).filter(x => x !== deck);
    gref.current = newGame({ decks: [deck, ...others] }); setAtkPlan({}); setBlkPlan({}); setPending(null); bump();
  }
  const act = (f: (g: Game) => void) => { if (gref.current) { f(gref.current); bump(); } };
  const opts: PassOpts = { stopAll, passUntilTurn: passUntil };
  useEffect(() => {
    if (!g || waitingForHuman(g, opts)) return;
    // run silent steps (passes) instantly; pause after anything visible happens
    const t = setTimeout(() => act(g => { const n = g.log.length; for (let i = 0; i < 300 && g.log.length === n && !waitingForHuman(g, opts); i++) tick(g, opts); }), g.priority === HUMAN ? 0 : speed);
    return () => clearTimeout(t);
  });

  if (!g) return (
    <div className="setup">
      <h1>Commander Arena</h1>
      <p className="sub">Four-player free-for-all Commander: you against three AI opponents. Everyone starts at 40 life. A player who takes 21 combat damage from a single commander loses. Each recast of a commander from the command zone costs {'{2}'} more.</p>
      <div className="deckpick">{DECKS.map(d => { const c = CARDS[d.commander]; return (
        <button key={d.id} className={`deckopt ${deck === d.id ? 'on' : ''}`} onClick={() => setDeck(d.id)}>
          <CardFace d={c} /><b>{d.name}</b><span>{c.name}</span></button>); })}</div>
      <button className="big" onClick={newMatch}>Start game ▶</button>
      <p className="credit">Card images and data are courtesy of Scryfall. Magic: The Gathering is © Wizards of the Coast. This is an unofficial fan project.</p>
    </div>
  );

  const me = g.players[HUMAN]; const myTurn = g.active === HUMAN && !me.lost;
  const pendingCard = pending ? (pending.kind === 'cast' ? [...me.hand, ...me.command].find(c => c.uid === pending.uid) : me.battlefield.find(c => c.uid === pending.uid)) : undefined;
  const humanChoice = g.choice && g.players[g.choice.controller].human ? g.choice : null;
  const spec: TargetSpec | undefined = humanChoice ? humanChoice.trig.target : pending && pendingCard ? (pending.kind === 'cast' ? def(pendingCard).spell?.target : def(pendingCard).abilities?.[pending.idx].target) : undefined;
  const targeting = !!spec;
  const isTarget = (t: Target) => !!spec && validTarget(g, HUMAN, spec, t);
  const blocking = g.awaiting === 'block' && defenders(g).includes(HUMAN) && !g.blockersDone.includes(HUMAN) && !me.lost;
  const declaring = g.awaiting === 'attack' && g.active === HUMAN && !me.lost;
  const myPriority = g.priority === HUMAN && !g.awaiting && !g.choice && g.winner === null && g.started && !shouldAutoPass(g, HUMAN, opts);
  const top = g.stack[g.stack.length - 1];
  const curAtkTarget = atkTarget !== null && !g.players[atkTarget].lost ? atkTarget : opponents(g, HUMAN)[0]?.id;

  const targetClick = (t: Target) => {
    if (!isTarget(t)) return;
    if (humanChoice) return act(g => { chooseTriggerTarget(g, t); });
    if (!pending) return;
    act(g => { if (pending.kind === 'cast') castSpell(g, HUMAN, pending.uid, t); else activate(g, HUMAN, pending.uid, pending.idx, t); }); setPending(null);
  };
  function clickHand(c: Card) {
    if (canPlayLand(g!, HUMAN, c)) return act(g => playLand(g, HUMAN, c.uid));
    if (!canCast(g!, HUMAN, c)) return;
    if (def(c).spell?.target) setPending({ kind: 'cast', uid: c.uid }); else act(g => castSpell(g, HUMAN, c.uid));
  }
  function activateAb(c: Card, i: number) {
    if (!canActivate(g!, HUMAN, c, i)) return;
    if (def(c).abilities![i].target) setPending({ kind: 'ability', uid: c.uid, idx: i }); else act(g => activate(g, HUMAN, c.uid, i));
  }
  function clickPermanent(c: Card) {
    if (targeting) { targetClick({ card: c.uid }); return; }
    if (declaring && c.owner === HUMAN) {
      const p = { ...atkPlan }; if (p[c.uid] !== undefined) delete p[c.uid]; else if (canAttack(g!, c) && curAtkTarget !== undefined) p[c.uid] = curAtkTarget; setAtkPlan(p); return;
    }
    if (blocking) {
      if (c.owner === HUMAN && isType(c, 'Creature') && !c.tapped) { if (blkPlan[c.uid] !== undefined) { const p = { ...blkPlan }; delete p[c.uid]; setBlkPlan(p); } else setSelBlocker(c.uid); return; }
      if (c.attacking === HUMAN && selBlocker !== null) { const b = findCard(g!, selBlocker)!; if (canBlock(g!, b, c)) setBlkPlan({ ...blkPlan, [selBlocker]: c.uid }); setSelBlocker(null); }
    }
  }
  const confirmAttacks = () => { act(g => { declareAttackers(g, HUMAN, Object.entries(atkPlan).map(([u, d]) => ({ uid: +u, defender: d }))); }); setAtkPlan({}); };
  const confirmBlocks = () => { act(g => declareBlockers(g, HUMAN, Object.entries(blkPlan).map(([b, a]) => ({ blocker: +b, attacker: a })))); setBlkPlan({}); setSelBlocker(null); };
  const doPass = () => act(g => { pass(g, HUMAN); });
  const endTurn = () => { setPassUntil(g.turn); act(g => { pass(g, HUMAN); }); };

  const cls = (c: Card) => {
    const out: string[] = [];
    if (atkPlan[c.uid] !== undefined || blkPlan[c.uid] !== undefined) out.push('planned');
    if (selBlocker === c.uid) out.push('selected');
    if (isTarget({ card: c.uid })) out.push('targetable');
    if (declaring && canAttack(g, c) && atkPlan[c.uid] === undefined) out.push('canact');
    if (blocking && c.owner === HUMAN && isType(c, 'Creature') && !c.tapped && blkPlan[c.uid] === undefined && selBlocker === null) out.push('canact');
    if (blocking && selBlocker !== null && c.attacking === HUMAN && canBlock(g, findCard(g, selBlocker)!, c)) out.push('targetable');
    return out.join(' ');
  };
  const ui: UI = { g, hover: setHover, click: clickPermanent, cls, clickPlayer: pid => targetClick({ player: pid }), playerTargetable: pid => isTarget({ player: pid }), atkTarget: curAtkTarget, setAtkTarget, atkPlan };
  const uiMe: UI = { ...ui, click: c => (me.command.includes(c) ? clickHand(c) : clickPermanent(c)), activateAb };

  // "What to do next" prompt
  const incoming = attackers(g).filter(a => a.attacking === HUMAN);
  const playable = me.hand.filter(c => canPlayLand(g, HUMAN, c) || canCast(g, HUMAN, c)).length + me.command.filter(c => canCast(g, HUMAN, c)).length + me.battlefield.reduce((s, c) => s + (def(c).abilities ?? []).filter((_, i) => canActivate(g, HUMAN, c, i)).length, 0);
  let prompt: string; let tone = 'you';
  const topDesc = top ? `${top.label} (${g.players[top.controller].name}${top.target ? ` → ${describeTarget(g, top.target)}` : ''})` : '';
  if (!g.started) prompt = `Look at your opening hand. Keep it, or mulligan for a new 7 (${me.mulligans === 0 ? 'your first mulligan is free' : `next mulligan puts ${me.mulligans} card(s) on the bottom`}).`;
  else if (g.winner !== null) { prompt = g.winner === HUMAN ? '🏆 You win! Every opponent is out.' : `${g.players[g.winner].name} wins the game.`; tone = 'end'; }
  else if (humanChoice) prompt = `⚡ Your trigger: ${CARDS[humanChoice.sourceId].name} — ${humanChoice.trig.label}. Choose its target (highlighted).`;
  else if (pendingCard && targeting) prompt = `Choose a target for ${def(pendingCard).name}: click a highlighted ${spec?.toLowerCase().endsWith('spell') ? 'spell on the stack' : spec === 'any' ? 'creature or player panel' : 'creature'}.`;
  else if (blocking) prompt = `⚠ You're under attack: ${incoming.length} creature(s), ${incoming.reduce((s, a) => s + power(g, a), 0)} damage incoming. ${selBlocker !== null ? 'Now click the attacker this creature should block.' : 'To block, click one of your untapped creatures, then the attacker. When you\'re done, press Confirm blocks.'}`;
  else if (declaring) prompt = `Declare attackers. Choose a target with "Attack this player", then click your glowing creatures (${Object.keys(atkPlan).length} assigned). Press Confirm when you're done; confirming with none skips combat.`;
  else if (myPriority && top) { prompt = `🔔 You have priority. Respond or pass. Top of stack: ${topDesc}.`; tone = 'prio'; }
  else if (myPriority && myTurn && (g.step === 'main1' || g.step === 'main2')) prompt = `${g.step === 'main1' ? 'Main phase 1' : 'Main phase 2'}: ${me.landPlayed ? 'you have played your land this turn' : me.hand.some(c => isType(c, 'Land')) ? 'play a land' : 'no land in hand'}${playable ? `, then cast spells or activate abilities (${playable} glowing card${playable > 1 ? 's' : ''})` : ', no spells are affordable right now'}. ${g.step === 'main1' ? 'Then go to combat or end your turn.' : 'End your turn when you\'re done.'}`;
  else if (myPriority) { prompt = `🔔 You have priority (${STEP_LABEL[g.step]}, ${g.active === HUMAN ? 'your' : g.players[g.active].name + "'s"} turn). Cast an instant, activate an ability, or pass.`; tone = 'prio'; }
  else if (me.lost) { prompt = 'You were eliminated. You are now watching the AI finish the game.'; tone = 'end'; }
  else { const who = g.priority !== null ? g.players[g.priority].name : g.players[g.active].name; prompt = top ? `${who === 'You' ? 'You are' : who + ' is'} deciding whether to respond to ${topDesc}…` : g.active === HUMAN ? `Your turn: ${STEP_LABEL[g.step]}…` : `${g.players[g.active].name}'s turn (${STEP_LABEL[g.step]}). ${who} has priority.`.replace(/^You's turn/, 'Your turn'); tone = 'wait'; }

  const shown = pinned ?? hover;
  return (
    <div className="app">
      <header>
        <b className="logo">Commander Arena</b>
        <div className="turninfo" style={{ borderColor: PCOLORS[g.active] }}>Turn {g.turn} · <b style={{ color: PCOLORS[g.active] }}>{g.players[g.active].name}</b></div>
        <div className="phasebar">{STEPS.map(s => <span key={s} className={`ph ${s === g.step ? 'cur' : ''} ${STEPS.indexOf(s) < STEPS.indexOf(g.step) ? 'done' : ''}`}>{STEP_LABEL[s]}</span>)}</div>
        <label className="hold" title="When on, you get priority at every step and on every stack item instead of smart auto-pass."><input type="checkbox" checked={stopAll} onChange={e => setStopAll(e.target.checked)} /> Hold priority</label>
        {passUntil === g.turn && <span className="autopass">Auto-passing to end of turn</span>}
        <label className="speed">AI speed <select value={speed} onChange={e => setSpeed(+e.target.value)}><option value={1100}>Slow</option><option value={600}>Normal</option><option value={150}>Fast</option></select></label>
        <button className="ghost" onClick={() => { gref.current = null; bump(); }}>Quit</button>
      </header>
      <div className={`prompt ${tone}`}>
        <span className="ptext">{prompt}</span>
        <span className="pbtns">
          {!g.started && <><button onClick={() => act(g => startGame(g))}>Keep hand</button><button className="ghost" onClick={() => act(g => mulligan(g, HUMAN))} disabled={me.mulligans >= 6}>Mulligan</button></>}
          {pendingCard && targeting && <button className="ghost" onClick={() => setPending(null)}>Cancel</button>}
          {myPriority && !targeting && !top && myTurn && g.step === 'main1' && <><button onClick={doPass}>⚔ Go to combat</button><button className="ghost" onClick={endTurn}>End turn</button></>}
          {myPriority && !targeting && !top && myTurn && g.step === 'main2' && <button onClick={endTurn}>End turn</button>}
          {myPriority && !targeting && (top || !(myTurn && (g.step === 'main1' || g.step === 'main2'))) && <button onClick={doPass}>{top ? `Pass (let ${top.label} resolve)` : 'Pass'}</button>}
          {declaring && <button onClick={confirmAttacks}>{Object.keys(atkPlan).length ? `Confirm ${Object.keys(atkPlan).length} attacker(s)` : 'No attack, skip combat'}</button>}
          {blocking && <button onClick={confirmBlocks}>{Object.keys(blkPlan).length ? `Confirm ${Object.keys(blkPlan).length} block(s)` : 'No blocks, take the damage'}</button>}
          {g.winner !== null && <button onClick={newMatch}>Play again</button>}
        </span>
      </div>
      <div className="main">
        <div className="table">
          <div className="opps">{[1, 2, 3].map(i => <PlayerArea key={i} ui={ui} pid={i} />)}</div>
          <PlayerArea ui={uiMe} pid={HUMAN} />
          <div className="handwrap">
            <div className="handlbl">Your hand ({me.hand.length})</div>
            <div className="hand">
              {me.hand.map(c => { const ok = canPlayLand(g, HUMAN, c) || canCast(g, HUMAN, c); return (
                <div key={c.uid} className={`hcard ${ok ? 'playable' : ''} ${pending?.uid === c.uid ? 'selected' : ''}`} onClick={() => clickHand(c)} onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}>
                  <CardFace d={def(c)} />
                </div>); })}
            </div>
          </div>
          <CombatArrows g={g} plan={atkPlan} blk={blkPlan} deps={[g.log.length, g.step]} />
        </div>
        <aside>
          <StackPanel g={g} hover={setHover} onPick={id => targetClick({ stack: id })} pickable={id => isTarget({ stack: id })} />
          <div className="preview" onClick={() => setPinned(null)}>
            {shown ? <><CardFace d={CARDS[shown]} big /><div className="ptxt"><b>{CARDS[shown].name}</b><div>{CARDS[shown].typeLine}</div><div className="oracle">{CARDS[shown].text || <i>(No abilities)</i>}</div></div></> : <div className="hint">Hover over any card to see it larger.</div>}
          </div>
          <div className="log" ref={el => { if (el) el.scrollTop = el.scrollHeight; }}>
            <div className="loghead">Game log</div>
            {g.log.slice(-120).map((l, i) => { const m = l.match(/^T(\d+) (.*)$/); const txt = m ? m[2] : l; const pl = g.players.find(p => txt.startsWith(p.name)); return (
              <div key={i} className={`le ${txt.startsWith('---') ? 'turnsep' : ''} ${/loses|wins/.test(txt) ? 'big' : ''} ${txt.startsWith('⚡') ? 'trig' : ''} ${/countered|fizzles/.test(txt) ? 'ctr' : ''}`} style={pl ? { borderLeftColor: PCOLORS[pl.id] } : undefined}>{youGrammar(txt.replace(/---/g, '').trim())}</div>); })}
          </div>
        </aside>
      </div>
    </div>
  );
}
