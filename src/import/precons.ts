/** Official preconstructed Commander decks (exact Wizards decklists, see scripts/fetch-precons.mjs), compiled from Oracle text. */
import data from '../data/precons.json';
import namor from '../data/namor.json';
import zurgo from '../data/zurgo.json';
import krenko from '../data/krenko.json';
import { classify, images } from './classify';
import type { ScryCard } from './scryfall';
import { registerCards, registerDeck } from '../engine/engine';
import type { DeckDef } from '../engine/types';

export interface Precon extends DeckDef { set: string; setName: string; /** ISO date the official product released; omitted on custom presets. */ released?: string; art?: string; supported: number; total: number; unsupported: string[] }
/** Wizards preconstructed product. Other presets (Namor, Zurgo, Krenko, filed under "Your decks") are the player's own lists. */
export const isOfficialPrecon = (p: { set: string }) => p.set !== 'USR';
interface Raw { decks: { id: string; name: string; set: string; setName: string; released?: string; commanders: string[]; cards: { q: number; name: string }[] }[]; cards: Record<string, ScryCard> }
let cache: Precon[] | null = null;
/** Compile + register every precon (idempotent). */
export function loadPrecons(): Precon[] {
  if (cache) return cache;
  const extras = [namor, zurgo, krenko] as unknown as Raw[];
  const raw: Raw = { decks: [...(data as unknown as Raw).decks, ...extras.flatMap(e => e.decks)], cards: { ...(data as unknown as Raw).cards, ...Object.assign({}, ...extras.map(e => e.cards)) } };
  const cls = new Map(Object.entries(raw.cards).map(([n, c]) => [n, classify(c)]));
  registerCards([...cls.values()].flatMap(x => [x.def, ...(x.def.prepDef ? [x.def.prepDef] : [])]));
  cache = raw.decks.map(d => {
    const ids = (n: string) => cls.get(n)!.def.id;
    const cmds = d.commanders.map(ids); let supported = 0; const unsupported: string[] = [];
    for (const l of [...d.commanders.map(name => ({ q: 1, name })), ...d.cards]) { if (cls.get(l.name)!.support === 'limited') unsupported.push(l.name); else supported += l.q; }
    const p: Precon = { id: d.id, name: d.name, commander: cmds[0], extra: cmds.slice(1), cards: d.cards.flatMap(l => Array(l.q).fill(ids(l.name))), set: d.set, setName: d.setName, released: d.released,
      art: images(raw.cards[d.commanders[0]]).art, supported, total: 100, unsupported };
    registerDeck(p); return p;
  });
  return cache;
}

export interface PreconSetGroup { set: string; setName: string; released: string; decks: Precon[] }
/** Official precons grouped by set, newest release first. Custom USR lists are omitted. */
export function groupOfficialPrecons(precons: Precon[]): PreconSetGroup[] {
  const groups = new Map<string, PreconSetGroup>();
  for (const d of precons) {
    if (!isOfficialPrecon(d)) continue;
    let g = groups.get(d.set);
    if (!g) { g = { set: d.set, setName: d.setName, released: d.released ?? '', decks: [] }; groups.set(d.set, g); }
    g.decks.push(d);
    if (d.released && d.released > g.released) g.released = d.released;
  }
  return [...groups.values()].sort((a, b) => (b.released || '').localeCompare(a.released || '') || a.setName.localeCompare(b.setName));
}
