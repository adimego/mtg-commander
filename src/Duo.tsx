import { CARDS, attackers, blockReason, canAttack, canCast, costOf, costText, ctr, def, hasKw, hasPriority, instantSpeed, isType, power, sorceryTiming, toughness, type Card, type Game } from './engine/engine';

const PAIR = ['#ef5350', '#42a5f5', '#ffb300', '#66bb6a', '#ab47bc', '#26c6da', '#ff7043', '#8d6e63'];
const SHOW_KW = ['flying', 'reach', 'menace', 'trample', 'deathtouch', 'first strike', 'double strike', 'vigilance', 'lifelink', 'haste', 'defender', 'hexproof'];

type DuoUi = {
  g: Game;
  wide: boolean;
  compact: boolean;
  targeting: boolean;
  declaring: boolean;
  viewOpp: number | null;
  toggleBoard: (pid: number) => void;
  clickPerm: (c: Card) => void;
  openZone: (pid: number, zone: 'graveyard' | 'exile') => void;
  eat: () => boolean;
  previewCard: (h: { id: string; uid?: number }) => void;
  castCommander: (c: Card) => void;
};

/** Why a commander in (or out of) the command zone can or cannot be cast right now. Cost includes commander tax while it is in the zone. */
export function commanderCastInfo(g: Game, c: Card): { ok: boolean; cost: string; why: string } {
  const p = g.players[c.owner];
  const cost = costText(costOf(g, c));
  if (!p.command.includes(c)) {
    const why = p.battlefield.includes(c) ? 'In play' : p.hand.includes(c) ? 'In your hand' : p.exile.includes(c) ? 'In exile' : p.graveyard.includes(c) ? 'In your graveyard' : 'Not in the command zone';
    return { ok: false, cost, why };
  }
  if (!instantSpeed(def(c)) && !sorceryTiming(g, c.owner)) return { ok: false, cost, why: 'Your main phase only' };
  if (!hasPriority(g, c.owner)) return { ok: false, cost, why: "You don't have priority" };
  if (!canCast(g, c.owner, c)) return { ok: false, cost, why: 'Not enough mana' };
  return { ok: true, cost, why: '' };
}

function CommandStrip({ ui }: { ui: DuoUi }) {
  const { g } = ui;
  const p = g.players[0];
  const ids = p.commanderIds;
  return (
    <div className="gcmd" data-command-zone>
      <span className="gcmd-label">Command zone</span>
      {ids.map(id => {
        const cmd = CARDS[id];
        const inZone = p.command.find(c => c.id === id && c.prepFor === undefined);
        const shown = inZone ?? [...p.battlefield, ...p.hand, ...p.graveyard, ...p.exile].find(c => c.id === id);
        const info = shown ? commanderCastInfo(g, shown) : { ok: false, cost: '', why: 'Not in the command zone' };
        const tax = 2 * (p.casts[id] ?? 0);
        const label = ids.length > 1 ? `Cast ${cmd?.name.split(',')[0] ?? 'commander'}` : 'Cast commander';
        return (
          <div className="gcmd-one" key={id}>
            <button type="button" className={`gcmd-tile ${inZone ? '' : 'away'} ${info.ok ? 'playable' : ''}`} data-cmd={id} title={`${cmd?.name ?? 'Commander'} (command zone). Commander tax: +${tax}`} onClick={() => { if (ui.eat()) return; ui.previewCard({ id, uid: shown?.uid }); }}>
              {cmd?.img ? <img className="cimg" src={cmd.img} alt={cmd.name} draggable={false} /> : <span className="gname">{cmd?.name ?? 'Commander'}</span>}
              <span className="tax">TAX +{tax}</span>
            </button>
            <button type="button" className="gcmd-cast" data-cast-cmd={id} data-cast-why={info.why} disabled={!info.ok} onClick={() => { if (info.ok && inZone) ui.castCommander(inZone); }}>
              <b>{label}</b>
              {info.cost && <span className="gcmd-cost">{info.cost}</span>}
              {!info.ok && <span className="gcmd-why">{info.why}</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}

const kwsOf = (c: Card) => (def(c).keywords ?? []).filter(k => SHOW_KW.includes(k));
const shortName = (c: Card) => def(c).name.split(',')[0];

function Tile({ ui, c, count }: { ui: DuoUi; c: Card; count?: number }) {
  const { g } = ui;
  const cr = isType(c, 'Creature');
  const counters = Object.entries(c.counters ?? {}).filter(([, v]) => v);
  const atk = c.attacking !== undefined ? g.players[c.attacking]?.name : undefined;
  return (
    <button type="button" className={`gtile ${c.tapped ? 'tapped' : ''} ${c.attacking !== undefined ? 'attacking' : ''} ${c.blocking !== undefined ? 'blocking' : ''} ${c.sick && !hasKw(c, 'haste') ? 'sick' : ''}`} data-uid={c.uid} data-attacking-name={atk} onClick={() => { if (ui.eat()) return; ui.clickPerm(c); }}>
      <span className="gname">{shortName(c)}{count && count > 1 ? ` ×${count}` : ''}</span>
      {cr && <span className="gpt">{power(g, c)}/{toughness(g, c) - c.damage}</span>}
      {c.sick && !hasKw(c, 'haste') && <i className="gsick" title="Summoning sick">z</i>}
      {atk && <span className="gatk">⚔ {atk}{c.atkPw !== undefined ? ' ◆' : ''}</span>}
      {c.blocking !== undefined && <span className="gblk">🛡</span>}
      {counters.map(([k, v]) => <span key={k} className="gctr" data-counter={k}>{k === '+1/+1' || k === '-1/-1' ? k : k}×{v}</span>)}
      {isType(c, 'Planeswalker') && <span className="gctr">◆{ctr(c, 'loyalty')}</span>}
    </button>
  );
}

function stacksOf(cards: Card[], expand: boolean) {
  if (expand) return cards.map(c => [c]);
  const out: Card[][] = [];
  const idx = new Map<string, number>();
  for (const c of cards) {
    if (!c.token) { out.push([c]); continue; }
    const key = `${c.id}|${c.tapped ? 1 : 0}|${c.attacking ?? ''}|${c.blocking ?? ''}|${JSON.stringify(c.counters ?? {})}`;
    const i = idx.get(key);
    if (i === undefined) { idx.set(key, out.length); out.push([c]); }
    else out[i].push(c);
  }
  return out;
}

/** Compact board for the wide foldable: every player's state fits in one viewport. */
export function GlanceBoard({ ui, pid }: { ui: DuoUi; pid: number }) {
  const { g } = ui;
  const p = g.players[pid];
  const expand = ui.targeting || ui.declaring;
  const creatures = p.battlefield.filter(c => isType(c, 'Creature') && !isType(c, 'Land'));
  const lands = p.battlefield.filter(c => isType(c, 'Land') && !isType(c, 'Creature'));
  const other = p.battlefield.filter(c => !creatures.includes(c) && !lands.includes(c));
  const tax = 2 * (p.casts[p.commanderId] ?? 0);
  const landGroups = new Map<string, Card[]>();
  for (const c of lands) landGroups.set(def(c).name, [...(landGroups.get(def(c).name) ?? []), c]);
  return (
    <div className="glance" data-glance={pid}>
      <div className="glance-head">
        <b className="glance-name" style={{ color: 'var(--pc)' }}>{p.name}</b>
        <span className="glance-life" title="Life">{p.life}</span>
        {p.poison ? <span className="glance-poison" data-poison={p.poison}>☠{p.poison}</span> : null}
        <span title="Cards in hand">✋{p.hand.length}</span>
        <span title="Cards in library">📚{p.library.length}</span>
        <button type="button" className="zbtn" title="View graveyard" onClick={e => { e.stopPropagation(); ui.openZone(pid, 'graveyard'); }}>🪦{p.graveyard.length}</button>
        <button type="button" className="zbtn" title="View exile" onClick={e => { e.stopPropagation(); ui.openZone(pid, 'exile'); }}>⛔{p.exile.length}</button>
        {pid !== 0 && <span className="glance-tax" title="Commander tax">Tax +{tax}</span>}
        {pid !== 0 && <span className="glance-cmd" title="Commander">{(CARDS[p.commanderId]?.name ?? 'Commander').split(',')[0]}</span>}
        {ui.compact && pid !== 0 && <button type="button" className="boardtoggle" aria-expanded={ui.viewOpp === pid} onClick={e => { e.stopPropagation(); ui.toggleBoard(pid); }}>{ui.viewOpp === pid ? 'Hide' : 'Board'}</button>}
      </div>
      <div className="glance-dmg">
        {g.players.filter(o => o.id !== pid).map(o => {
          const v = p.cmdDamage[`${o.id}`] || 0;
          return <span key={o.id} className={`gcd ${v >= 14 ? 'danger' : ''}`} title={`${v}/21 from ${o.name}`}>{v}</span>;
        })}
      </div>
      {pid === 0 && <CommandStrip ui={ui} />}
      <div className="glance-body">
        <div className="gzone" data-group="creatures">
          {stacksOf(creatures, expand).map(cs => <Tile key={cs[0].uid} ui={ui} c={cs[0]} count={cs.length} />)}
          {!creatures.length && <span className="gempty">No creatures</span>}
        </div>
        <div className="gzone" data-group="other">
          {stacksOf(other, expand).map(cs => <Tile key={cs[0].uid} ui={ui} c={cs[0]} count={cs.length} />)}
        </div>
        <div className="gzone glands" data-group="lands">
          {[...landGroups].map(([name, cs]) => {
            const untap = cs.filter(c => !c.tapped).length;
            return <button type="button" key={name} className="gland" data-land={cs[0].id} onClick={() => { if (ui.eat()) return; ui.clickPerm(cs[0]); }}>{name} ×{cs.length}{untap !== cs.length ? `, ${untap} untapped` : ''}</button>;
          })}
        </div>
      </div>
    </div>
  );
}

export function AttackDock({ g, plan, pw, target, onAttack, onAim, onAll, onPreview }: {
  g: Game; plan: Record<number, number>; pw: Record<number, number>; target?: number;
  onAttack: (c: Card, defender: number, pwUid?: number) => void; onAim: (pid: number) => void; onAll: () => void; onPreview: (c: Card) => void;
}) {
  const me = g.players[0];
  const opps = g.players.filter(p => p.id !== 0 && !p.lost);
  const creatures = me.battlefield.filter(c => isType(c, 'Creature'));
  const totals: Record<number, number> = {};
  for (const [uid, defId] of Object.entries(plan)) {
    const c = me.battlefield.find(x => x.uid === +uid);
    if (c) totals[defId] = (totals[defId] ?? 0) + Math.max(0, power(g, c));
  }
  return (
    <div className="combatdock" data-combat="attack">
      <div className="combatbar">
        {opps.map(p => <button type="button" key={p.id} className={target === p.id ? 'on' : ''} data-defender={p.id} onClick={() => onAim(p.id)}>{p.name} · {totals[p.id] ?? 0}</button>)}
        <button type="button" data-attack-all onClick={onAll}>Attack all → {target !== undefined ? g.players[target].name : '…'}</button>
      </div>
      <div className="combatscroll">
        {creatures.map(c => {
          const to = plan[c.uid];
          const ok = canAttack(g, c);
          const walkers = opps.flatMap(p => p.battlefield.filter(w => isType(w, 'Planeswalker')));
          return (
            <div className="combatrow" key={c.uid} data-uid={c.uid}>
              <button type="button" className={`gtile big ${to !== undefined ? 'on' : ''}`} data-atk={c.uid} disabled={!ok && to === undefined} onClick={() => onAttack(c, to ?? target ?? opps[0]?.id ?? 1, pw[c.uid])}>
                <b>{shortName(c)}</b>
                <span className="gpt">{power(g, c)}/{toughness(g, c)}</span>
                <span className="gkw">{kwsOf(c).join(' · ')}</span>
                {!ok && <span className="gwhy">Can't attack</span>}
                {to !== undefined && <span className="gatk">⚔ {g.players[to].name}{pw[c.uid] !== undefined ? ' ◆' : ''}</span>}
              </button>
              <div className="defbtns">
                {opps.map(p => <button type="button" key={p.id} className={to === p.id && pw[c.uid] === undefined ? 'on' : ''} data-defender={p.id} onClick={() => onAttack(c, p.id)}>{p.name}</button>)}
                {walkers.map(w => <button type="button" key={w.uid} className={pw[c.uid] === w.uid ? 'on' : ''} data-pw={w.uid} onClick={() => onAttack(c, w.owner, w.uid)}>◆ {shortName(w)}</button>)}
                <button type="button" className="ghost" onClick={() => onPreview(c)}>Preview</button>
              </div>
            </div>
          );
        })}
        {!creatures.length && <p className="gempty">No creatures.</p>}
      </div>
    </div>
  );
}

export function BlockDock({ g, plan, selected, onPick, onAssign, onUnassign, onMove, onPreview }: {
  g: Game; plan: Record<number, number>; selected: number | null;
  onPick: (c: Card) => void; onAssign: (attacker: number) => void; onUnassign: (blocker: number) => void; onMove: (blocker: number, dir: -1 | 1) => void; onPreview: (c: Card) => void;
}) {
  const me = g.players[0];
  const incoming = attackers(g).filter(a => a.attacking === 0);
  const mine = me.battlefield.filter(c => isType(c, 'Creature') && !c.tapped);
  const counts: Record<number, number> = {};
  for (const a of Object.values(plan)) counts[a] = (counts[a] ?? 0) + 1;
  let open = 0;
  for (const a of incoming) {
    const n = counts[a.uid] ?? 0;
    if (n === 0 || (hasKw(a, 'menace') && n < 2)) open += Math.max(0, power(g, a));
  }
  const orderFor = (atk: number) => Object.entries(plan).filter(([, a]) => a === atk).map(([b]) => +b);
  return (
    <div className="combatdock" data-combat="block" data-unblocked={open}>
      <div className="combatbar">
        <span>Unblocked damage <b data-unblocked-n>{open}</b></span>
        {selected !== undefined && selected !== null && <span>Blocker selected · tap an attacker</span>}
      </div>
      <div className="combatscroll">
        <div className="blockerchips">
          {mine.map(b => <button type="button" key={b.uid} className={`gtile big ${selected === b.uid ? 'on' : ''} ${plan[b.uid] !== undefined ? 'assigned' : ''}`} data-blocker={b.uid} onClick={() => onPick(b)}>
            <b>{shortName(b)}</b><span className="gpt">{power(g, b)}/{toughness(g, b)}</span><span className="gkw">{kwsOf(b).join(' · ')}</span>
          </button>)}
          {!mine.length && <span className="gempty">No untapped creatures</span>}
        </div>
        {incoming.map((a, i) => {
          const color = PAIR[i % PAIR.length];
          const assigned = orderFor(a.uid);
          const sel = selected !== null ? me.battlefield.find(c => c.uid === selected) : undefined;
          const why = sel ? blockReason(g, sel, a) : null;
          const menace = hasKw(a, 'menace') && assigned.length === 1;
          const orderMatters = assigned.length >= 2 && (hasKw(a, 'trample') || hasKw(a, 'deathtouch'));
          return (
            <div key={a.uid} className="brow" data-incoming={a.uid} style={{ borderColor: color }} onDragOver={e => e.preventDefault()}>
              <button type="button" className="gtile big" data-assign={a.uid} onClick={() => onAssign(a.uid)}>
                <b>{shortName(a)}</b>
                <span className="gpt">{power(g, a)}/{toughness(g, a)}</span>
                <span className="gkw">{kwsOf(a).join(' · ')}</span>
                <span className="gatk">from {g.players[a.owner].name}</span>
              </button>
              <div className="assigned">
                {assigned.map((uid, k) => {
                  const b = me.battlefield.find(c => c.uid === uid);
                  if (!b) return null;
                  return <span key={uid} className="apair" style={{ borderColor: color }}>
                    <button type="button" data-assigned={uid} onClick={() => onUnassign(uid)}>{shortName(b)} {power(g, b)}/{toughness(g, b)}</button>
                    {orderMatters && <>
                      <button type="button" data-order="earlier" disabled={k === 0} onClick={() => onMove(uid, -1)}>Earlier</button>
                      <button type="button" data-order="later" disabled={k === assigned.length - 1} onClick={() => onMove(uid, 1)}>Later</button>
                    </>}
                  </span>;
                })}
                {!assigned.length && <span className="gempty">Unblocked · {Math.max(0, power(g, a))} damage</span>}
                {menace && <span className="gwhy">Menace: needs 2 blockers, or this damage still gets through</span>}
                {why && <span className="gwhy">{why}</span>}
                {orderMatters && <span className="gwhy">Damage order: Earlier is dealt to first</span>}
              </div>
              <button type="button" className="ghost" onClick={() => onPreview(a)}>Preview</button>
            </div>
          );
        })}
        {!incoming.length && <p className="gempty">Nothing is attacking you.</p>}
      </div>
    </div>
  );
}
