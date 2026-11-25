import { Card, Game, def, power, toughness, isType } from './engine/engine';

/** Identity for stacking tokens: name, P/T, counters, abilities, damage, and sickness — not tapped state. */
export function stackIdentity(g: Game, c: Card): string {
  if (!c.token) return `uid:${c.uid}`;
  const d = def(c);
  const counters = Object.entries(c.counters ?? {}).filter(([, n]) => n).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}:${n}`).join(',');
  const kws = [...new Set([...(d.keywords ?? []), ...(c.pkw ?? [])])].sort().join(',');
  const attached = c.attachedTo ?? 0;
  return [d.name, power(g, c), toughness(g, c), c.damage ?? 0, counters, kws, c.sick ? 1 : 0, c.faceDown ? 1 : 0, attached, d.text].join('|');
}

export type Tile =
  | { kind: 'one'; card: Card }
  | { kind: 'stack'; key: string; cards: Card[]; sample: Card };

export function groupTiles(g: Game, cards: Card[]): Tile[] {
  const seen = new Map<string, Card[]>();
  const order: string[] = [];
  for (const c of cards) {
    const k = stackIdentity(g, c);
    if (!seen.has(k)) { seen.set(k, []); order.push(k); }
    seen.get(k)!.push(c);
  }
  return order.map(k => {
    const cs = seen.get(k)!;
    if (cs.length === 1 || !cs[0].token) return { kind: 'one', card: cs[0] };
    const sample = cs.find(c => !c.tapped) ?? cs[0];
    return { kind: 'stack', key: k, cards: cs, sample };
  });
}

export function stackCaption(g: Game, cards: Card[]): string {
  const name = def(cards[0]).name;
  const n = cards.length;
  const un = cards.filter(c => !c.tapped).length;
  if (un === 0) return `${name} ×${n} · all tapped`;
  return `${name} ×${n} · ${un} untapped`;
}

/** Shrink battlefield card width as the zone gets crowded. Floor is a readable minimum. */
export function crowdedCardWidth(base: string, tiles: number, compact: boolean): string {
  if (tiles <= 8) return base;
  const floor = compact ? 40 : 52;
  const start = compact ? 72 : 96;
  const w = Math.max(floor, Math.round(start - (tiles - 8) * (compact ? 2 : 2.5)));
  return `${w}px`;
}

export const creatureCards = (cards: Card[]) => cards.filter(c => isType(c, 'Creature'));

/** Pick N untapped-first cards from a stack (for "attack with N"). */
export function pickFromStack(cards: Card[], n: number, preferUntapped = true): Card[] {
  const ordered = preferUntapped ? [...cards].sort((a, b) => Number(a.tapped) - Number(b.tapped)) : [...cards];
  return ordered.slice(0, Math.max(0, Math.min(n, cards.length)));
}

