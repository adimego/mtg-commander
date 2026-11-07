import React, { useState } from 'react';
import { Game, Card, Decision, def, CARDS } from './engine/engine';
import type { Modes } from './engine/types';

type Face = (p: { d: ReturnType<typeof def> }) => React.ReactElement;
const COLOR_NAME: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };

/** A dialog box that floats over the table without hiding it completely. */
function Box({ title, sub, children, wide }: { title: string; sub?: string; children: React.ReactNode; wide?: boolean }) {
  return <div className="modal choice"><div className={`mbox ${wide ? 'wide' : ''}`} data-dialog={title}>
    <h2>{title}</h2>{sub && <p className="csub">{sub}</p>}{children}
  </div></div>;
}
function CardPick({ cards, sel, toggle, Face, setHover, badge }: { cards: Card[]; sel: number[]; toggle: (u: number) => void; Face: Face; setHover: (id: string | null) => void; badge?: (c: Card) => string | null }) {
  return <div className="zgrid pickgrid">{cards.map(c => { const i = sel.indexOf(c.uid); const b = badge?.(c); return (
    <div key={c.uid} className={`zcard pick ${i >= 0 ? 'on' : ''}`} data-pick={c.uid} onClick={() => toggle(c.uid)} onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}>
      <Face d={def(c)} />{(b ?? (i >= 0 ? String(i + 1) : null)) && <span className="pickn">{b ?? i + 1}</span>}
    </div>); })}</div>;
}

/** Prompts raised while a spell or ability resolves: may, pick, scry/surveil, trigger order, color, player. */
export function DecisionDialog({ g, d, answer, Face, setHover, castNow }: { g: Game; d: Decision; answer: (a: unknown) => void; Face: Face; setHover: (id: string | null) => void; castNow?: (uid: number) => void }) {
  const [sel, setSel] = useState<number[]>([]);
  const toggle = (u: number, max = 99) => setSel(s => (s.includes(u) ? s.filter(x => x !== u) : s.length >= max ? [...s.slice(1), u] : [...s, u]));
  const src = d.src ? CARDS[d.src]?.name : undefined;
  switch (d.kind) {
    case 'cast': {
      const c = g.players[d.pid].exile.find(x => x.uid === d.uid);
      return <Box title={src ?? 'Cast'} sub={d.text}>{c && <CardPick cards={[c]} sel={[]} toggle={() => {}} Face={Face} setHover={setHover} />}<div className="cbtns">
        <button className="big" data-ans="cast" disabled={!c || !castNow} onClick={() => castNow?.(d.uid)}>Cast it{d.free ? ' (free)' : ''}</button><button className="sec" data-ans="no" onClick={() => answer(false)}>Don't cast</button></div></Box>;
    }
    case 'may':
      return <Box title={src ?? 'Choose'} sub={d.text}><div className="cbtns">
        <button className="big" data-ans="yes" onClick={() => answer(true)}>Yes</button><button className="sec" data-ans="no" onClick={() => answer(false)}>No</button></div></Box>;
    case 'pick': {
      const ok = sel.length >= d.min && sel.length <= d.max;
      return <Box wide title={src ? `${src}: choose` : 'Choose cards'} sub={`${d.text} ${d.min === d.max ? `Pick exactly ${d.min}.` : `Pick ${d.min ? `${d.min}–` : 'up to '}${d.max}.`}`}>
        {d.cards.length ? <CardPick cards={d.cards} sel={sel} toggle={u => toggle(u, d.max)} Face={Face} setHover={setHover} /> : <p className="muted">No matching cards.</p>}
        <div className="cbtns"><button className="big" disabled={!ok} data-ans="confirm" onClick={() => answer(sel)}>Confirm ({sel.length})</button>
          {d.min === 0 && <button className="sec" onClick={() => answer([])}>Choose none</button>}</div>
      </Box>;
    }
    case 'scry': {
      // sel = cards kept on top, in the order clicked (first = top)
      return <Box wide title={`${d.mode === 'scry' ? 'Scry' : 'Surveil'} ${d.cards.length}`} sub={`Click the cards to keep on top, in order (1 = top card). The rest go ${d.mode === 'scry' ? 'to the bottom of your library' : 'to your graveyard'}.`}>
        <CardPick cards={d.cards} sel={sel} toggle={u => toggle(u)} Face={Face} setHover={setHover} badge={c => (sel.includes(c.uid) ? `Top ${sel.indexOf(c.uid) + 1}` : d.mode === 'scry' ? 'Bottom' : 'Graveyard')} />
        <div className="cbtns"><button className="big" data-ans="confirm" onClick={() => answer({ top: sel, away: d.cards.filter(c => !sel.includes(c.uid)).map(c => c.uid) })}>Confirm</button>
          <button className="sec" onClick={() => setSel(d.cards.map(c => c.uid))}>Keep all on top</button></div>
      </Box>;
    }
    case 'orderTop': {
      const rest = d.cards.filter(c => !sel.includes(c.uid));
      return <Box wide title="Reorder your library" sub={d.text + ' Click cards in the order they should sit, first click on top.'}>
        <CardPick cards={d.cards} sel={sel} toggle={u => toggle(u)} Face={Face} setHover={setHover} badge={c => sel.includes(c.uid) ? `Top ${sel.indexOf(c.uid) + 1}` : '…'} />
        <div className="cbtns"><button className="big" disabled={sel.length + rest.length !== d.cards.length || sel.length === 0 && d.cards.length > 0} data-ans="confirm" onClick={() => answer({ order: [...sel, ...rest.map(c => c.uid)] })}>Confirm</button>
          <button className="sec" onClick={() => answer({ order: d.cards.map(c => c.uid) })}>Keep this order</button></div>
      </Box>;
    }
    case 'order': {
      return <Box title="Order your triggers" sub={d.text + ' Click them in the order they should resolve (1 resolves first).'}>
        <div className="olist">{d.items.map((it, i) => { const k = sel.indexOf(i); return (
          <button key={i} className={`oitem ${k >= 0 ? 'on' : ''}`} data-order={i} onClick={() => toggle(i)} onMouseEnter={() => setHover(it.sourceId)} onMouseLeave={() => setHover(null)}>
            <b>{k >= 0 ? k + 1 : '·'}</b> {CARDS[it.sourceId].name}: {it.trig.label}</button>); })}</div>
        <div className="cbtns"><button className="big" data-ans="confirm" onClick={() => answer(sel)}>Confirm order</button><button className="sec" onClick={() => answer(d.items.map((_, i) => i))}>Default order</button></div>
      </Box>;
    }
    case 'color':
      return <Box title={src ?? 'Choose a color'} sub={d.text}><div className="cbtns">{d.options.map(c => <button key={c} className={`colbtn pip-${c}`} data-ans={c} onClick={() => answer(c)}>{COLOR_NAME[c] ?? c}</button>)}</div></Box>;
    case 'ctype':
      return <Box title={src ?? 'Choose a creature type'} sub={d.text}><div className="cbtns"><select className="ctype" data-ctype defaultValue={d.options[0]} onChange={e => setSel([d.options.indexOf(e.target.value)])}>{d.options.map(o => <option key={o} value={o}>{o}</option>)}</select><button className="big" data-ans="confirm" onClick={() => answer(d.options[sel[0] ?? 0] ?? d.options[0])}>Choose</button></div></Box>;
    case 'player':
      return <Box title={src ?? 'Choose a player'} sub={d.text}><div className="cbtns">{d.players.map(p => <button key={p} className="sec" data-ans={p} onClick={() => answer(p)}>{g.players[p].name}</button>)}</div></Box>;
  }
}

/** Kicker / X / modes, asked before choosing targets. */
export function WarpDialog({ name, cost, normal, pick, cancel }: { name: string; cost: string; normal: string; pick: (w: boolean) => void; cancel: () => void }) {
  return <Box title={name} sub={`Cast it for its warp cost ${cost}? It's exiled at the beginning of the next end step, and you may cast it from exile on a later turn.`}><div className="cbtns">
    <button className="big" data-ans="warp" onClick={() => pick(true)}>Warp ({cost})</button><button className="sec" data-ans="nowarp" onClick={() => pick(false)}>Cast normally ({normal})</button><button className="sec" onClick={cancel}>Cancel</button></div></Box>;
}
export function AltCostDialog({ name, opts, pick, cancel }: { name: string; opts: { k: string; label: string }[]; pick: (k: string) => void; cancel: () => void }) {
  return <Box title={name} sub="Choose how to cast it."><div className="cbtns">
    {opts.map((o, i) => <button key={o.k} className={i === 0 ? 'big' : 'sec'} data-ans={o.k || 'normal'} onClick={() => pick(o.k)}>{o.label}</button>)}<button className="sec" onClick={cancel}>Cancel</button></div></Box>;
}
export function TeamworkDialog({ name, n, pick, cancel }: { name: string; n: number; pick: (t: boolean) => void; cancel: () => void }) {
  return <Box title={name} sub={`Teamwork ${n}: tap untapped creatures you control with total power ${n} or more as you cast it?`}><div className="cbtns">
    <button className="big" data-ans="team" onClick={() => pick(true)}>Use teamwork</button><button className="sec" data-ans="noteam" onClick={() => pick(false)}>Cast without teamwork</button><button className="sec" onClick={cancel}>Cancel</button></div></Box>;
}
export function KickerDialog({ name, cost, pick, cancel }: { name: string; cost: string; pick: (k: boolean) => void; cancel: () => void }) {
  return <Box title={name} sub={`Pay the kicker cost ${cost} as well?`}><div className="cbtns">
    <button className="big" data-ans="kick" onClick={() => pick(true)}>Kick it ({cost})</button><button className="sec" data-ans="nokick" onClick={() => pick(false)}>Cast without kicker</button><button className="sec" onClick={cancel}>Cancel</button></div></Box>;
}
export function XDialog({ name, max, pick, cancel }: { name: string; max: number; pick: (x: number) => void; cancel: () => void }) {
  const [x, setX] = useState(max);
  return <Box title={`${name}: choose X`} sub={`You can afford up to X = ${max}.`}>
    <div className="xrow"><button className="sec" onClick={() => setX(Math.max(0, x - 1))}>−</button><input type="range" min={0} max={max} value={x} onChange={e => setX(+e.target.value)} /><button className="sec" onClick={() => setX(Math.min(max, x + 1))}>+</button><b className="xval" data-x={x}>X = {x}</b></div>
    <div className="cbtns"><button className="big" data-ans="confirm" onClick={() => pick(x)}>Confirm X = {x}</button><button className="sec" onClick={cancel}>Cancel</button></div>
  </Box>;
}
export function ModesDialog({ name, m, avail, pick, cancel }: { name: string; m: Modes; avail: boolean[]; pick: (ms: number[]) => void; cancel?: () => void }) {
  const [sel, setSel] = useState<number[]>([]);
  const ok = sel.length >= m.min && sel.length <= m.max;
  const toggle = (i: number) => setSel(s => m.repeat ? (s.length >= m.max ? s : [...s, i]) : (s.includes(i) ? s.filter(x => x !== i) : m.max === 1 ? [i] : s.length >= m.max ? s : [...s, i]));
  const drop = (i: number) => setSel(s => { const k = s.lastIndexOf(i); return k < 0 ? s : s.filter((_, j) => j !== k); });
  return <Box title={`${name}: choose ${m.min === m.max ? (m.min === 1 ? 'one' : m.min) : `${m.min}–${m.max}`}`} sub={m.repeat ? 'You may choose the same mode more than once. Click to add it; − removes one.' : undefined}>
    <div className="olist">{m.list.map((md, i) => { const n = sel.filter(x => x === i).length; return <button key={i} disabled={!avail[i] && !n} className={`oitem ${n ? 'on' : ''}`} data-mode={i} onClick={() => toggle(i)}><b>{n ? (m.repeat ? `×${n}` : '✓') : '•'}</b> {md.label.replace(/~/g, name).replace(/^./, ch => ch.toUpperCase())}{m.repeat && n > 0 && <span className="sec" onClick={e => { e.stopPropagation(); drop(i); }}> −</span>}</button>; })}</div>
    <div className="cbtns"><button className="big" disabled={!ok} data-ans="confirm" onClick={() => pick(m.repeat ? sel : [...sel].sort((a, b) => a - b))}>Confirm</button>{cancel && <button className="sec" onClick={cancel}>Cancel</button>}</div>
  </Box>;
}
