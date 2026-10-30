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
export const canBeCommander = (c: ScryCard) => (/\bLegendary\b/.test(front(c).type_line ?? c.type_line) && /\bCreature\b/.test(front(c).type_line ?? c.type_line)) || /can be your commander/i.test(c.oracle_text ?? front(c).oracle_text ?? '');
const hasPartner = (c: ScryCard) => (c.keywords ?? []).some(k => /^(partner|friends forever|doctor's companion)$/i.test(k)) || /partner with|choose a background/i.test(c.oracle_text ?? '') || /\bBackground\b/.test(c.type_line);
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
  for (const c of cmdRows) if (!canBeCommander(c.scry)) errors.push(`${c.name} can't be a commander (not a legendary creature).`);
  if (cmdRows.length === 2) {
    if (!cmdRows.every(c => hasPartner(c.scry))) errors.push(`${cmdRows[0].name} and ${cmdRows[1].name} can't both be commanders: both need Partner (or Partner with, Friends forever, or Background).`);
    warnings.push(`Partner pairs aren't fully supported: ${cmdRows[0].name} goes in the command zone, and ${cmdRows[1].name} is shuffled into your library.`);
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

export interface SavedDeck { id: string; name: string; commander: string; cards: string[]; defs: CardDef[]; art?: string; colors: Color[]; stats: { builtin: number; auto: number; limited: number; swapped: number }; source: string; created: number; legal: boolean }
const BASIC: Record<Color, string> = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
const basicId = (k: Color) => Object.values(CARDS).find(d => d.basic && d.name === BASIC[k])!.id;

/** Build a playable deck. Limited cards stay (vanilla) unless swapLimited, which replaces nonland limited cards with basics. */
export function buildDeck(r: Resolved, commanders: string[], o: { name: string; swapLimited: boolean; source: string; legal: boolean }): SavedDeck {
  const cmd = r.rows.find(x => x.name === commanders[0])!;
  const ident = [...new Set(commanders.flatMap(n => r.rows.find(x => x.name === n)?.scry.color_identity ?? []))] as Color[];
  const cards: string[] = []; const defs = new Map<string, CardDef>(); const stats = { builtin: 0, auto: 0, limited: 0, swapped: 0 };
  let bi = 0; const basics = ident.filter(k => COLORS.includes(k));
  for (const x of r.rows) {
    let q = x.qty; if (x.name === commanders[0]) q -= 1; // the commander goes to the command zone
    for (let i = 0; i < q; i++) {
      if (x.cls.support === 'limited' && o.swapLimited && basics.length && !x.cls.def.types.includes('Land')) { cards.push(basicId(basics[bi++ % basics.length])); stats.swapped++; continue; }
      cards.push(x.cls.def.id); stats[x.cls.support]++;
      if (x.cls.support !== 'builtin') defs.set(x.cls.def.id, x.cls.def);
    }
  }
  if (cmd.cls.support !== 'builtin') defs.set(cmd.cls.def.id, cmd.cls.def);
  // the engine needs a legendary creature commander definition; keep its real identity
  const id = 'imp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return { id, name: o.name, commander: cmd.cls.def.id, cards, defs: [...defs.values()], art: images(cmd.scry).art ?? cmd.cls.def.art, colors: ident, stats, source: o.source, created: Date.now(), legal: o.legal };
}

// ---------- persistence ----------
const KEY = 'ca_decks_v1';
const store = () => (typeof localStorage !== 'undefined' ? localStorage : null);
export function loadSaved(): SavedDeck[] { try { return JSON.parse(store()?.getItem(KEY) ?? '[]'); } catch { return []; } }
function write(list: SavedDeck[]) { store()?.setItem(KEY, JSON.stringify(list)); }
export function activate(d: SavedDeck) { registerCards(d.defs); registerDeck(toDeckDef(d)); }
export const toDeckDef = (d: SavedDeck): DeckDef => ({ id: d.id, name: d.name, commander: d.commander, cards: d.cards });
export function activateAll() { const l = loadSaved(); l.forEach(activate); return l; }
export function saveDeck(d: SavedDeck) { const l = loadSaved().filter(x => x.id !== d.id); l.push(d); write(l); activate(d); return l; }
export function deleteDeck(id: string) { const l = loadSaved().filter(x => x.id !== id); write(l); unregisterDeck(id); return l; }
export function renameDeck(id: string, name: string) { const l = loadSaved(); const d = l.find(x => x.id === id); if (d) { d.name = name; write(l); activate(d); } return l; }
/** Plain-text export ("1 Name" lines, commander marked *CMDR*); round-trips through the importer. */
export function exportText(d: SavedDeck): string {
  const counts = new Map<string, number>(); for (const id of d.cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  const nm = (id: string) => (CARDS[id] ?? d.defs.find(x => x.id === id))?.name ?? id;
  return [`1 ${nm(d.commander)} *CMDR*`, ...[...counts].map(([id, q]) => `${q} ${nm(id)}`)].join('\n') + '\n';
}
