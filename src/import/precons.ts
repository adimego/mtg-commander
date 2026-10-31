/** Official preconstructed Commander decks (exact Wizards decklists, see scripts/fetch-precons.mjs), compiled from Oracle text. */
import data from '../data/precons.json';
import { classify, images } from './classify';
import type { ScryCard } from './scryfall';
import { registerCards, registerDeck } from '../engine/engine';
import type { DeckDef } from '../engine/types';

export interface Precon extends DeckDef { set: string; setName: string; art?: string; supported: number; total: number; unsupported: string[] }
interface Raw { decks: { id: string; name: string; set: string; setName: string; commanders: string[]; cards: { q: number; name: string }[] }[]; cards: Record<string, ScryCard> }
let cache: Precon[] | null = null;
/** Compile + register every precon (idempotent). */
export function loadPrecons(): Precon[] {
  if (cache) return cache;
  const raw = data as unknown as Raw; const cls = new Map(Object.entries(raw.cards).map(([n, c]) => [n, classify(c)]));
  registerCards([...cls.values()].flatMap(x => [x.def, ...(x.def.prepDef ? [x.def.prepDef] : [])]));
  cache = raw.decks.map(d => {
    const ids = (n: string) => cls.get(n)!.def.id;
    const cmds = d.commanders.map(ids); let supported = 0; const unsupported: string[] = [];
    for (const l of [...d.commanders.map(name => ({ q: 1, name })), ...d.cards]) { if (cls.get(l.name)!.support === 'limited') unsupported.push(l.name); else supported += l.q; }
    const p: Precon = { id: d.id, name: d.name, commander: cmds[0], extra: cmds.slice(1), cards: d.cards.flatMap(l => Array(l.q).fill(ids(l.name))), set: d.set, setName: d.setName,
      art: images(raw.cards[d.commanders[0]]).art, supported, total: 100, unsupported };
    registerDeck(p); return p;
  });
  return cache;
}
