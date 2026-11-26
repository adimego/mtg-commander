/** Build an engine deck from a parsed list + Scryfall data; Commander legality; localStorage persistence. */
import { CARDS, CardDef, Color, COLORS, DeckDef, registerCards, registerDeck, unregisterDeck } from '../engine/engine';
import type { Parsed } from './parse';
import type { Lookup, ScryCard } from './scryfall';
import { classify, Classified, images } from './classify';

export interface Row { name: string; qty: number; scry: ScryCard; cls: Classified; commanderMarked: boolean }
export interface Resolved { rows: Row[]; missing: string[]; fuzzy: Record<string, string>; warnings: string[] }

export function resolve(parsed: Parsed, lk: Lookup): Resolved {
  const rows: Row[] = []; const merged = new Map<string, Row>();
  for (const e of parsed.entries) {
    const sc = lk.found.get(e.name); if (!sc) continue;
    const key = sc.name + (e.section === 'commander' ? '#c' : '');
    const ex = merged.get(key); if (ex) { ex.qty += e.qty; continue; }
    const r: Row = { name: sc.name, qty: e.qty, scry: sc, cls: classify(sc), commanderMarked: e.section === 'commander' }; merged.set(key, r); rows.push(r);
  }
  return { rows, missing: lk.missing, fuzzy: lk.fuzzy, warnings: parsed.warnings };
}

const front = (c: ScryCard) => c.card_faces?.[0] ?? c;
export const canBeCommander = (c: ScryCard) => (/\bLegendary\b/.test(front(c).type_line ?? c.type_line) && /\bCreature\b/.test(front(c).type_line ?? c.type_line)) || /can be your commander/i.test(c.oracle_text ?? front(c).oracle_text ?? '') || (/\bLegendary\b/.test(c.type_line) && /isn't on the battlefield, it's a [^.]*creature in addition to its other types/i.test(c.oracle_text ?? ''));
export const isBackground = (c: ScryCard) => /\bBackground\b/.test(c.type_line ?? '');
const partnerWithName = (c: ScryCard) => {
  const kw = (c.keywords ?? []).find(k => /^partner with /i.test(k));
  if (kw) return kw.replace(/^partner with /i, '').trim();
  const m = /partner with ([^\n(]+)/i.exec(c.oracle_text ?? '');
  return m ? m[1].trim() : undefined;
};
export function pairingInfo(c: ScryCard) {
  const kw = (c.keywords ?? []).map(k => k.toLowerCase());
  const text = c.oracle_text ?? '';
  const withName = partnerWithName(c);
  return {
    partner: !withName && (kw.includes('partner') || /(?:^|\n)partner(?:\s|\(|$)/im.test(text)),
    partnerWith: withName,
    friendsForever: kw.includes('friends forever') || /friends forever/i.test(text),
    chooseBackground: kw.includes('choose a background') || /choose a background/i.test(text),
    background: isBackground(c),
    doctorsCompanion: kw.includes("doctor's companion") || /doctor's companion/i.test(text),
    timeLordDoctor: /\bTime Lord\b/.test(c.type_line ?? '') && /\bDoctor\b/.test(c.type_line ?? ''),
  };
}
/** Null if the two cards form a legal commander pair under the CR; otherwise an error. */
export function pairError(a: ScryCard, b: ScryCard): string | null {
  const A = pairingInfo(a), B = pairingInfo(b);
  const named = (x?: string, y?: string) => !!x && !!y && x.toLowerCase() === y.toLowerCase();
  if (A.partnerWith || B.partnerWith) {
    if (named(A.partnerWith, b.name) || named(B.partnerWith, a.name)) return null;
    return `${a.name} and ${b.name} aren't a Partner with pair.`;
  }
  if (A.friendsForever && B.friendsForever) return null;
  if (A.partner && B.partner) return null;
  if ((A.chooseBackground && B.background) || (B.chooseBackground && A.background)) return null;
  if ((A.doctorsCompanion && B.timeLordDoctor) || (B.doctorsCompanion && A.timeLordDoctor)) return null;
  return `${a.name} and ${b.name} can't both be commanders: they don't share a legal pairing (Partner, Partner with, Friends forever, Choose a Background, or Doctor's companion).`;
}
export const canBeSecondCommander = (first: ScryCard, second: ScryCard) => !pairError(first, second);
const anyNumber = (c: ScryCard) => /a deck can have any number of cards named/i.test(c.oracle_text ?? '') || /\bBasic\b/.test(c.type_line);

/** Commander candidates: marked ones first, otherwise every eligible card in the list. */
export function commanderOptions(r: Resolved): string[] {
  const marked = r.rows.filter(x => x.commanderMarked).map(x => x.name);
  const elig = r.rows.filter(x => canBeCommander(x.scry)).map(x => x.name);
  return [...new Set([...marked, ...elig])];
}
export const defaultCommanders = (r: Resolved): string[] => { const m = r.rows.filter(x => x.commanderMarked).map(x => x.name); return m.length ? m.slice(0, 2) : commanderOptions(r).slice(0, 1); };

export interface Legality { errors: string[]; warnings: string[]; total: number }
export function checkLegality(r: Resolved, commanders: string[]): Legality {
  const errors: string[] = []; const warnings: string[] = [];
  const cmdRows = commanders.map(n => r.rows.find(x => x.name === n)).filter(Boolean) as Row[];
  const total = r.rows.reduce((s, x) => s + x.qty, 0);
  if (!cmdRows.length) errors.push('No commander chosen.');
  if (cmdRows.length === 1) {
    if (!canBeCommander(cmdRows[0].scry)) errors.push(`${cmdRows[0].name} can't be a commander (not a legendary creature).`);
  }
  if (cmdRows.length === 2) {
    const [a, b] = cmdRows;
    const aOk = canBeCommander(a.scry) || isBackground(a.scry);
    const bOk = canBeCommander(b.scry) || isBackground(b.scry);
    if (!aOk) errors.push(`${a.name} can't be a commander (not a legendary creature).`);
    if (!bOk) errors.push(`${b.name} can't be a commander (not a legendary creature or Background).`);
    if (isBackground(a.scry) && isBackground(b.scry)) errors.push('A Background must be paired with a commander that has Choose a Background.');
    const err = pairError(a.scry, b.scry);
    if (err) errors.push(err);
  }
  if (cmdRows.length > 2) errors.push('At most two commanders.');
  if (total !== 100) errors.push(`Deck has ${total} cards including the commander. Commander decks need exactly 100.`);
  const ident = new Set(cmdRows.flatMap(c => c.scry.color_identity));
  const counts = new Map<string, number>(); for (const x of r.rows) counts.set(x.name, (counts.get(x.name) ?? 0) + x.qty);
  for (const [n, q] of counts) { const sc = r.rows.find(x => x.name === n)!.scry; if (q > 1 && !anyNumber(sc)) errors.push(`${n} appears ${q} times (singleton format).`); }
  const outside = r.rows.filter(x => x.scry.color_identity.some(k => !ident.has(k)));
  if (cmdRows.length) for (const x of outside) errors.push(`${x.name} (${x.scry.color_identity.join('')}) is outside the commander's color identity (${[...ident].join('') || 'colorless'}).`);
  for (const x of r.rows) { const l = x.scry.legalities?.commander; if (l === 'banned') errors.push(`${x.name} is banned in Commander.`); else if (l === 'not_legal') errors.push(`${x.name} is not legal in Commander.`); }
  if (r.missing.length) warnings.push(`${r.missing.length} card name${r.missing.length > 1 ? 's' : ''} not found on Scryfall and skipped: ${r.missing.join(', ')}.`);
  for (const [a, b] of Object.entries(r.fuzzy)) warnings.push(`"${a}" matched as ${b}.`);
  return { errors, warnings, total };
}

export interface SavedDeck { id: string; name: string; commander: string; partner?: string; cards: string[]; defs: CardDef[]; art?: string; colors: Color[]; stats: { builtin: number; auto: number; limited: number; swapped: number }; source: string; created: number; legal: boolean }
const BASIC: Record<Color, string> = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
const basicId = (k: Color) => Object.values(CARDS).find(d => d.basic && d.name === BASIC[k])!.id;

/** Build a playable deck. Limited cards stay (vanilla) unless swapLimited, which replaces nonland limited cards with basics. */
export function buildDeck(r: Resolved, commanders: string[], o: { name: string; swapLimited: boolean; source: string; legal: boolean }): SavedDeck {
  const cmd = r.rows.find(x => x.name === commanders[0])!;
  const ident = [...new Set(commanders.flatMap(n => r.rows.find(x => x.name === n)?.scry.color_identity ?? []))] as Color[];
  const cards: string[] = []; const defs = new Map<string, CardDef>(); const stats = { builtin: 0, auto: 0, limited: 0, swapped: 0 };
  let bi = 0; const basics = ident.filter(k => COLORS.includes(k));
  for (const x of r.rows) {
    let q = x.qty; if (commanders.includes(x.name)) q -= 1; // commanders go to the command zone
    for (let i = 0; i < q; i++) {
      if (x.cls.support === 'limited' && o.swapLimited && basics.length && !x.cls.def.types.includes('Land')) { cards.push(basicId(basics[bi++ % basics.length])); stats.swapped++; continue; }
      cards.push(x.cls.def.id); stats[x.cls.support]++;
      if (x.cls.support !== 'builtin') defs.set(x.cls.def.id, x.cls.def);
    }
  }
  if (cmd.cls.support !== 'builtin') defs.set(cmd.cls.def.id, cmd.cls.def);
  const partnerRow = commanders[1] ? r.rows.find(x => x.name === commanders[1]) : undefined;
  if (partnerRow && partnerRow.cls.support !== 'builtin') defs.set(partnerRow.cls.def.id, partnerRow.cls.def);
  const id = 'imp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return { id, name: o.name, commander: cmd.cls.def.id, partner: partnerRow?.cls.def.id, cards, defs: [...defs.values()], art: images(cmd.scry).art ?? cmd.cls.def.art, colors: ident, stats, source: o.source, created: Date.now(), legal: o.legal };
}

// ---------- persistence ----------
const KEY = 'ca_decks_v1';
const store = () => (typeof localStorage !== 'undefined' ? localStorage : null);
export function loadSaved(): SavedDeck[] { try { return JSON.parse(store()?.getItem(KEY) ?? '[]'); } catch { return []; } }
function write(list: SavedDeck[]) { store()?.setItem(KEY, JSON.stringify(list)); }
export function activate(d: SavedDeck) { registerCards(d.defs); registerDeck(toDeckDef(d)); }
export const toDeckDef = (d: SavedDeck): DeckDef => ({ id: d.id, name: d.name, commander: d.commander, partner: d.partner, cards: d.cards });
export function activateAll() { const l = loadSaved(); l.forEach(activate); return l; }
export function saveDeck(d: SavedDeck) { const l = loadSaved().filter(x => x.id !== d.id); l.push(d); write(l); activate(d); return l; }
export function deleteDeck(id: string) { const l = loadSaved().filter(x => x.id !== id); write(l); unregisterDeck(id); return l; }
export function renameDeck(id: string, name: string) { const l = loadSaved(); const d = l.find(x => x.id === id); if (d) { d.name = name; write(l); activate(d); } return l; }
/** Plain-text export ("1 Name" lines, commander marked *CMDR*); round-trips through the importer. */
export function exportText(d: SavedDeck): string {
  const counts = new Map<string, number>(); for (const id of d.cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  const nm = (id: string) => (CARDS[id] ?? d.defs.find(x => x.id === id))?.name ?? id;
  const cmdLines = [`1 ${nm(d.commander)} *CMDR*`]; if (d.partner && d.partner !== d.commander) cmdLines.push(`1 ${nm(d.partner)} *CMDR*`);
  return [...cmdLines, ...[...counts].map(([id, q]) => `${q} ${nm(id)}`)].join('\n') + '\n';
}

/** Strict import is allowed only when every card is fully supported (auto or builtin). */
export function canStrictSave(stats: { limited: number } | { lim: number }): boolean {
  const lim = 'limited' in stats ? stats.limited : stats.lim;
  return lim === 0;
}
