import { useEffect, useReducer, useRef, useState } from 'react';
import { Game, Card, newGame, startGame, mulligan, def, isType, hasKw, power, toughness, costOf, canCast, canPlayLand, castSpell, playLand, needsTarget, validTarget, advance, canAttack, declareAttackers, declareBlockers, attackers, isDefending, canBlock, opponents, findCard, Cost, COLORS, STEPS, DECKS } from './engine/engine';
import { tick, waitingForHuman } from './engine/controller';

const costStr = (c: Cost) => `${c.generic ? c.generic : ''}${COLORS.map(k => k.repeat(c[k] || 0)).join('')}` || '0';
const STEP_LABEL: Record<string, string> = { untap: 'Untap', upkeep: 'Upkeep', draw: 'Draw', main1: 'Main 1', attackers: 'Declare attackers', blockers: 'Declare blockers', damage: 'Combat damage', main2: 'Main 2', end: 'End' };
const HUMAN = 0;

function CardView({ g, c, onClick, cls }: { g: Game; c: Card; onClick?: () => void; cls?: string }) {
  const d = def(c); const cr = isType(c, 'Creature');
  return (
    <div className={`card c-${d.colors.join('') || 'X'} ${c.tapped ? 'tapped' : ''} ${c.attacking !== undefined ? 'attacking' : ''} ${c.blocking !== undefined ? 'blocking' : ''} ${cls ?? ''}`} onClick={onClick} title={`${d.name} — ${d.types.join(' ')}\n${d.text}`}>
      <div className="cname">{d.name}{!isType(c, 'Land') && <span className="cost">{costStr(costOf(g, c))}</span>}</div>
      <div className="ctype">{d.legendary ? 'Legendary ' : ''}{d.types.join(' ')}</div>
      <div className="ctext">{d.text}</div>
      {cr && <div className="pt">{power(g, c)}/{toughness(g, c) - c.damage}{c.sick && !hasKw(c, 'haste') ? ' 💤' : ''}</div>}
    </div>
  );
}

export default function App() {
  const gref = useRef<Game | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [deck, setDeck] = useState(DECKS[0].id);
  const [speed, setSpeed] = useState(350);
  const [pending, setPending] = useState<number | null>(null); // uid of spell awaiting target
  const [atkTarget, setAtkTarget] = useState<number | null>(null);
  const [atkPlan, setAtkPlan] = useState<Record<number, number>>({});
  const [selBlocker, setSelBlocker] = useState<number | null>(null);
  const [blkPlan, setBlkPlan] = useState<Record<number, number>>({});
  const g = gref.current;

  function newMatch() {
    const others = DECKS.map(d => d.id).filter(x => x !== deck);
    gref.current = newGame({ decks: [deck, ...others] }); setAtkPlan({}); setBlkPlan({}); setPending(null); bump();
  }
  const act = (f: (g: Game) => void) => { if (gref.current) { f(gref.current); bump(); } };

  useEffect(() => {
    if (!g || waitingForHuman(g)) return;
    const t = setTimeout(() => act(tick), g.players[g.active].human ? 60 : speed);
    return () => clearTimeout(t);
  });

  if (!g) return (
    <div className="setup"><h1>Commander Arena</h1><p>4-player free-for-all Commander. You vs 3 AI opponents. 40 life, 21 commander damage, commander tax.</p>
      <label>Your deck: <select value={deck} onChange={e => setDeck(e.target.value)}>{DECKS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <button className="big" onClick={newMatch}>New game</button></div>
  );

  const me = g.players[HUMAN]; const myTurn = g.active === HUMAN && !me.lost;
  const pendingCard = pending !== null ? [...me.hand, ...me.command].find(c => c.uid === pending) : undefined;
  const blocking = g.step === 'blockers' && isDefending(g, HUMAN) && !g.blockersDone.includes(HUMAN) && !me.lost;
  const curAtkTarget = atkTarget !== null && !g.players[atkTarget].lost ? atkTarget : opponents(g, HUMAN)[0]?.id;

  function targetClick(t: { card?: number; player?: number }) {
    if (!pendingCard) return false;
    act(g => { castSpell(g, HUMAN, pendingCard.uid, t); }); setPending(null); return true;
  }
  function clickHand(c: Card) {
    if (canPlayLand(g!, HUMAN, c)) return act(g => playLand(g, HUMAN, c.uid));
    if (!canCast(g!, HUMAN, c)) return;
    if (needsTarget(def(c))) setPending(c.uid); else act(g => castSpell(g, HUMAN, c.uid));
  }
  function clickPermanent(c: Card) {
    if (pendingCard) { if (validTarget(g!, def(pendingCard), { card: c.uid })) targetClick({ card: c.uid }); return; }
    if (g!.step === 'attackers' && myTurn && c.owner === HUMAN) {
      const p = { ...atkPlan }; if (p[c.uid] !== undefined) delete p[c.uid]; else if (canAttack(g!, c) && curAtkTarget !== undefined) p[c.uid] = curAtkTarget; setAtkPlan(p); return;
    }
    if (blocking) {
      if (c.owner === HUMAN && isType(c, 'Creature') && !c.tapped) { if (blkPlan[c.uid] !== undefined) { const p = { ...blkPlan }; delete p[c.uid]; setBlkPlan(p); } else setSelBlocker(c.uid); return; }
      if (c.attacking === HUMAN && selBlocker !== null) { const b = findCard(g!, selBlocker)!; if (canBlock(g!, b, c)) setBlkPlan({ ...blkPlan, [selBlocker]: c.uid }); setSelBlocker(null); }
    }
  }
  const confirmAttacks = () => { act(g => { declareAttackers(g, HUMAN, Object.entries(atkPlan).map(([u, d]) => ({ uid: +u, defender: d }))); advance(g); }); setAtkPlan({}); };
  const confirmBlocks = () => { act(g => declareBlockers(g, HUMAN, Object.entries(blkPlan).map(([b, a]) => ({ blocker: +b, attacker: a })))); setBlkPlan({}); setSelBlocker(null); };
  const endTurn = () => act(g => { const t = g.turn; let i = 0; while (g.turn === t && g.winner === null && i++ < 20) advance(g); });

  const permCls = (c: Card) => [atkPlan[c.uid] !== undefined ? 'planned' : '', blkPlan[c.uid] !== undefined ? 'planned' : '', selBlocker === c.uid ? 'selected' : '', pendingCard && validTarget(g, def(pendingCard), { card: c.uid }) ? 'targetable' : ''].join(' ');

  function PlayerArea({ pid }: { pid: number }) {
    const p = g!.players[pid]; const lands = p.battlefield.filter(c => isType(c, 'Land')); const other = p.battlefield.filter(c => !isType(c, 'Land'));
    const playerTargetable = pendingCard && validTarget(g!, def(pendingCard), { player: pid });
    return (
      <div className={`player ${g!.active === pid ? 'active' : ''} ${p.lost ? 'lost' : ''} ${pid === HUMAN ? 'me' : ''}`}>
        <div className={`phead ${playerTargetable ? 'targetable' : ''}`} onClick={() => playerTargetable && targetClick({ player: pid })}>
          <b>{p.name}</b> <span className="deck">{p.deckName}</span>
          <span className="life">❤ {p.life}</span>
          <span>Hand {p.hand.length} · Library {p.library.length} · GY {p.graveyard.length}</span>
          {pid !== HUMAN && myTurn && g!.step === 'attackers' && !p.lost && <button className={curAtkTarget === pid ? 'on' : ''} onClick={e => { e.stopPropagation(); setAtkTarget(pid); }}>Attack this player</button>}
          {p.lost && <b className="out">ELIMINATED</b>}
        </div>
        <div className="cmdrow">
          <span>Commander: {def({ id: p.commanderId }).name} {p.command.length ? `(command zone, cost ${costStr(costOf(g!, p.command[0]))})` : '(on battlefield/elsewhere)'} · tax +{2 * p.commanderCasts}</span>
          <span className="cdmg">Cmdr dmg taken: {g!.players.filter(o => o.id !== pid).map(o => `${o.name.split(' ')[0] === 'AI' ? o.name : 'You'}: ${p.cmdDamage[o.id] || 0}`).join(' · ')}</span>
        </div>
        <div className="row">{other.map(c => <CardView key={c.uid} g={g!} c={c} cls={permCls(c)} onClick={() => clickPermanent(c)} />)}</div>
        <div className="lands">{lands.map(c => <span key={c.uid} className={`land c-${(def(c).produces ?? []).join('')} ${c.tapped ? 'tapped' : ''}`} title={def(c).text}>{def(c).name}</span>)}</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <b>Commander Arena</b>
        <span className="phase">Turn {g.turn} · {g.players[g.active].name} · {STEPS.map(s => <span key={s} className={s === g.step ? 'cur' : ''}>{STEP_LABEL[s]}</span>)}</span>
        <label>AI speed <select value={speed} onChange={e => setSpeed(+e.target.value)}><option value={800}>slow</option><option value={350}>normal</option><option value={60}>fast</option></select></label>
        <button onClick={() => { gref.current = null; bump(); }}>Quit</button>
      </header>
      {g.winner !== null && <div className="banner">{g.players[g.winner].name} {g.winner === HUMAN ? 'win' : 'wins'} the game! <button onClick={newMatch}>Play again</button></div>}
      <div className="main">
        <div className="table">
          <div className="opps">{[1, 2, 3].map(i => <PlayerArea key={i} pid={i} />)}</div>
          <PlayerArea pid={HUMAN} />
          <div className="actions">
            {!g.started && <>
              <span>Opening hand ({me.mulligans === 0 ? 'first mulligan is free' : `mulligans: ${me.mulligans}`}):</span>
              <button onClick={() => act(g => startGame(g))}>Keep hand</button>
              <button onClick={() => act(g => mulligan(g, HUMAN))} disabled={me.mulligans >= 6}>Mulligan</button>
            </>}
            {pendingCard && <><span>Choose a target for {def(pendingCard).name} (highlighted)</span><button onClick={() => setPending(null)}>Cancel</button></>}
            {g.started && myTurn && g.step === 'main1' && !pendingCard && <><button onClick={() => act(advance)}>Go to combat</button><button onClick={endTurn}>End turn</button></>}
            {g.started && myTurn && g.step === 'main2' && !pendingCard && <button onClick={endTurn}>End turn</button>}
            {g.started && myTurn && g.step === 'attackers' && <><span>Click creatures to attack the selected player ({curAtkTarget !== undefined ? g.players[curAtkTarget].name : '-'}). </span><button onClick={confirmAttacks}>Confirm attacks ({Object.keys(atkPlan).length})</button></>}
            {blocking && <><span>You are being attacked! Click your creature, then the attacker it blocks.{selBlocker !== null ? ' (blocker selected)' : ''}</span><button onClick={confirmBlocks}>Confirm blocks ({Object.keys(blkPlan).length})</button></>}
            {g.started && !myTurn && !blocking && g.winner === null && <span>{me.lost ? 'You were eliminated — spectating.' : 'Opponent\'s turn… (you can cast instants when the game waits for you)'}</span>}
            {myTurn && attackers(g).length > 0 && g.step !== 'attackers' && <span> Attacking: {attackers(g).length}</span>}
          </div>
          <div className="hand">
            {me.command.map(c => <CardView key={c.uid} g={g} c={c} cls={`cmdzone ${canCast(g, HUMAN, c) ? 'playable' : ''}`} onClick={() => clickHand(c)} />)}
            {me.hand.map(c => <CardView key={c.uid} g={g} c={c} cls={canPlayLand(g, HUMAN, c) || canCast(g, HUMAN, c) ? 'playable' : ''} onClick={() => clickHand(c)} />)}
          </div>
        </div>
        <div className="log">{[...g.log].reverse().map((l, i) => <div key={i}>{l}</div>)}</div>
      </div>
    </div>
  );
}
