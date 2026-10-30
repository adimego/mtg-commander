import { ReactNode, useMemo, useRef, useState } from 'react';
import { parseDecklist } from './import/parse';
import { lookupCards } from './import/scryfall';
import { resolve, Resolved, commanderOptions, defaultCommanders, checkLegality, buildDeck, SavedDeck, canBeCommander } from './import/deck';

const SAMPLE_HINT = `Paste a decklist. Any of these work:
1 Sol Ring
1x Sol Ring
1 Sol Ring (CMR) 472
1 Atraxa, Praetors' Voice *CMDR*
Commander / Deck section headers (Arena, Moxfield)
MTGO .txt (commander in SIDEBOARD) or .dek files`;

export function ImportDialog({ close, saved, art }: { close: () => void; saved: (d: SavedDeck) => void; art: (img?: string) => ReactNode }) {
  const [text, setText] = useState(''); const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<Resolved | null>(null);
  const [cmd, setCmd] = useState<string[]>([]); const [swap, setSwap] = useState(false); const [showAll, setShowAll] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  async function check() {
    setErr(null); const parsed = parseDecklist(text);
    if (!parsed.entries.length) { setErr("Couldn't find any cards in that list."); return; }
    setBusy('Looking up cards on Scryfall…');
    try {
      const lk = await lookupCards(parsed.entries.map(e => e.name), { onProgress: (d, t) => setBusy(`Looking up cards on Scryfall… ${d}/${t}`) });
      const r = resolve(parsed, lk); setRes(r); setCmd(defaultCommanders(r));
      if (!name) setName(defaultCommanders(r)[0] ?? 'Imported deck');
    } catch (e) { setErr(`Scryfall lookup failed: ${(e as Error).message}. Check your connection and try again.`); }
    setBusy(null);
  }
  const legality = useMemo(() => res && checkLegality(res, cmd.filter(Boolean)), [res, cmd]);
  const opts = res ? commanderOptions(res) : [];
  const stats = useMemo(() => {
    if (!res) return null; let full = 0, lim = 0; for (const r of res.rows) if (r.cls.support === 'limited') lim += r.qty; else full += r.qty; return { full, lim };
  }, [res]);
  const limitedRows = res ? res.rows.filter(r => r.cls.support === 'limited') : [];
  const cmdRow = res?.rows.find(r => r.name === cmd[0]);
  function save() {
    if (!res || !cmd[0] || !legality) return;
    const d = buildDeck(res, cmd.filter(Boolean), { name: name.trim() || cmd[0], swapLimited: swap, source: text, legal: !legality.errors.length });
    saved(d);
  }
  const loadFile = async (f?: File) => { if (!f) return; setText(await f.text()); if (!name) setName(f.name.replace(/\.(txt|dek|dec)$/i, '')); setRes(null); };

  return (
    <div className="modal" onClick={close}><div className="mbox wide importbox" onClick={e => e.stopPropagation()}>
      <h2>Import a Commander deck <button className="x" onClick={close}>✕</button></h2>
      {!res ? <>
        <div className="improw">
          <textarea className="decktext" value={text} onChange={e => setText(e.target.value)} placeholder={SAMPLE_HINT} spellCheck={false}
            onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }} />
          <div className="impside">
            <label>Deck name<input value={name} onChange={e => setName(e.target.value)} placeholder="Named after the commander if left empty" /></label>
            <button onClick={() => file.current?.click()}>📄 Load .txt / .dek file…</button>
            <input ref={file} type="file" accept=".txt,.dek,.dec,text/plain" hidden onChange={e => loadFile(e.target.files?.[0])} />
            <p className="muted small">Formats: "1 Sol Ring", "1x Sol Ring", "1 Sol Ring (CMR) 472", <b>*CMDR*</b> markers, Archidekt <b>[Commander]</b> categories, <b>Commander</b>/<b>Deck</b> headers (Arena, Moxfield), MTGO .txt (commander in the sideboard) and MTGO .dek. Maybeboard and Considering sections are ignored.</p>
            <p className="muted small">Cards are looked up on Scryfall from your browser. Cards the game can't model fully are flagged before you play.</p>
            {err && <p className="bad">{err}</p>}
            <button className="big" disabled={!text.trim() || !!busy} onClick={check}>{busy ?? 'Check deck ▸'}</button>
          </div>
        </div>
      </> : <>
        <div className="improw report">
          <div className="impcmd">
            <div className="cmdart">{art(cmdRow?.cls.def.img)}</div>
            <label>Commander<select value={cmd[0] ?? ''} onChange={e => setCmd([e.target.value, ...(cmd[1] && cmd[1] !== e.target.value ? [cmd[1]] : [])])}>
              {!opts.length && <option value="">— no legendary creature found —</option>}
              {opts.map(o => <option key={o}>{o}</option>)}</select></label>
            {opts.length > 1 && <label>Partner (optional)<select value={cmd[1] ?? ''} onChange={e => setCmd([cmd[0], ...(e.target.value ? [e.target.value] : [])])}>
              <option value="">none</option>{opts.filter(o => o !== cmd[0] && res.rows.find(r => r.name === o && canBeCommander(r.scry))).map(o => <option key={o}>{o}</option>)}</select></label>}
            <label>Deck name<input value={name} onChange={e => setName(e.target.value)} /></label>
          </div>
          <div className="impsum">
            <div className="stats">
              <div className="stat good"><b>{stats!.full}</b><span>fully supported</span></div>
              <div className="stat lim"><b>{stats!.lim}</b><span>limited support</span></div>
              <div className={`stat ${legality!.total === 100 ? 'good' : 'badc'}`}><b>{legality!.total}</b><span>cards (need 100)</span></div>
            </div>
            {legality!.errors.length > 0 && <div className="issues bad"><b>Not Commander-legal ({legality!.errors.length})</b><ul>{legality!.errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}{legality!.errors.length > 8 && <li>…and {legality!.errors.length - 8} more</li>}</ul></div>}
            {(legality!.warnings.length > 0 || res.warnings.length > 0) && <div className="issues warn"><b>Warnings</b><ul>{[...legality!.warnings, ...res.warnings].slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
            {limitedRows.length > 0 && <div className="issues lim">
              <b>Limited support ({stats!.lim} card{stats!.lim === 1 ? '' : 's'}).</b> The game models these simplified, and they show a <span className="limtag">Limited</span> badge in play.
              <table><tbody>{(showAll ? limitedRows : limitedRows.slice(0, 10)).map(r => <tr key={r.name}><td>{r.qty > 1 ? `${r.qty}× ` : ''}{r.name}</td><td>{r.cls.reason}</td></tr>)}</tbody></table>
              {limitedRows.length > 10 && <button className="link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${limitedRows.length}`}</button>}
              <div className="swap"><label><input type="radio" checked={!swap} onChange={() => setSwap(false)} /> Keep them, with simplified rules</label>
                <label><input type="radio" checked={swap} onChange={() => setSwap(true)} /> Swap limited nonland cards for basic lands</label></div>
            </div>}
          </div>
        </div>
        <div className="impbtns">
          <button onClick={() => setRes(null)}>◂ Edit list</button>
          <button className={`big ${legality!.errors.length ? 'warnbtn' : ''}`} disabled={!cmd[0]} onClick={save}>{legality!.errors.length ? 'Save anyway (casual) ▸' : 'Save deck ▸'}</button>
        </div>
      </>}
    </div></div>
  );
}
