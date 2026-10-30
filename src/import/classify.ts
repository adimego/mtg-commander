/** Turn Scryfall cards into engine CardDefs and classify how well the engine supports them. Honest by design:
 *  - 'builtin': the card already exists in the hand-modelled pool (full rules support).
 *  - 'auto':    every line of its rules text is something the engine models generically (supported keywords,
 *               "{T}: Add ..." mana abilities, "enters tapped"), so it plays exactly as printed.
 *  - 'limited': anything else. It plays as a vanilla permanent (printed P/T + supported keywords) or a spell
 *               with no effect, and is badged "Limited support" in game. */
import { CARDS, CardDef, Color, Cost, ManaSym, COLORS } from '../engine/engine';
import type { ScryCard } from './scryfall';

export const ENGINE_KW = ['flying', 'trample', 'haste', 'vigilance', 'lifelink', 'deathtouch', 'first strike', 'double strike', 'reach', 'menace', 'defender', 'flash', 'hexproof', 'prowess'];
export type Support = 'builtin' | 'auto' | 'limited';
export interface Classified { def: CardDef; support: Support; reason?: string }

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const BUILTIN_BY_NAME: Record<string, CardDef> = Object.fromEntries(Object.values(CARDS).filter(d => !d.limited && !d.id.startsWith('x-')).map(d => [d.name.toLowerCase(), d]));
export const builtinByName = (n: string) => BUILTIN_BY_NAME[n.toLowerCase()];

/** Strict cost: only generic, {C} and WUBRG pips. Returns null if the cost uses X, hybrid, phyrexian, snow... */
export function strictCost(mc = ''): Cost | null {
  const cost: Cost = { generic: 0 };
  for (const [, s] of mc.matchAll(/\{([^}]+)\}/g)) {
    if (/^\d+$/.test(s)) cost.generic += +s; else if (s === 'C') cost.generic += 1;
    else if ((COLORS as string[]).includes(s)) cost[s as Color] = (cost[s as Color] || 0) + 1; else return null;
  }
  return cost;
}
/** Lenient cost for limited cards: X = 0, hybrid {W/U} = 1 generic, {2/W} = 2, phyrexian = 1 generic, snow = 1. */
export function lenientCost(mc = ''): Cost {
  const cost: Cost = { generic: 0 };
  for (const [, s] of mc.matchAll(/\{([^}]+)\}/g)) {
    if (/^\d+$/.test(s)) cost.generic += +s; else if ((COLORS as string[]).includes(s)) cost[s as Color] = (cost[s as Color] || 0) + 1;
    else if (s === 'X' || s === 'Y') continue; else if (/^2\//.test(s)) cost.generic += 2; else cost.generic += 1;
  }
  return cost;
}
const stripReminder = (t: string) => t.replace(/\([^)]*\)/g, '').replace(/[ \t]+\n/g, '\n').trim();

/** Parse "{T}: Add ..." → mana units, or null. */
export function parseManaLine(line: string): ManaSym[] | null {
  const m = /^\{T\}: Add (.+)\.$/.exec(line.trim()); if (!m) return null;
  const inner = m[1];
  if (/^one mana of any colou?r$/i.test(inner)) return ['ANY'];
  const syms = [...inner.matchAll(/\{([WUBRGC])\}/g)].map(x => x[1]);
  const rest = inner.replace(/\{[WUBRGC]\}/g, '').replace(/,|\bor\b|\s/g, '');
  if (!syms.length || rest) return null;
  if (/\bor\b/.test(inner)) return [syms.join('|') as ManaSym];
  return syms as ManaSym[];
}
const ETB_TAPPED = /^(?:this \w+|.+) enters(?: the battlefield)? tapped\.$/i;

function faces(c: ScryCard) { return c.card_faces?.length ? c.card_faces : null; }
export function images(c: ScryCard) { const f = faces(c); const iu = c.image_uris ?? f?.[0]?.image_uris; return { img: iu?.normal, art: iu?.art_crop }; }

export function classify(c: ScryCard): Classified {
  const b = builtinByName(c.name); if (b) return { def: b, support: 'builtin' };
  const f = faces(c); const front = f?.[0] ?? c;
  const typeLine = front.type_line ?? c.type_line;
  const types = typeLine.split('—')[0].trim().split(/\s+/).filter(t => !['Legendary', 'Basic', 'Snow', 'World', 'Tribal', 'Kindred', 'Ongoing'].includes(t));
  const { img, art } = images(c);
  const text = f ? f.map(x => x.oracle_text ?? '').join('\n//\n') : c.oracle_text ?? '';
  const d: CardDef = { id: 'x-' + slug(c.name), name: c.name, types, cost: lenientCost(front.mana_cost), colors: (c.colors ?? []) as Color[], typeLine: c.type_line, text, img, art, identity: c.color_identity as Color[] };
  if (/\bLegendary\b/.test(typeLine)) d.legendary = true;
  if (/\bBasic\b/.test(typeLine)) d.basic = true;
  const kws = (c.keywords ?? []).map(k => k.toLowerCase()).filter(k => ENGINE_KW.includes(k)); if (kws.length) d.keywords = kws;
  const isCreature = types.includes('Creature'); const ptOk = !isCreature || (/^\d+$/.test(front.power ?? '') && /^\d+$/.test(front.toughness ?? ''));
  if (isCreature) { d.power = parseInt(front.power ?? '0') || 0; d.toughness = parseInt(front.toughness ?? '1') || 1; }
  const problems: string[] = [];
  if (f) problems.push(`${c.layout ?? 'multi-face'} card: only the front face is used`);
  if (!ptOk) problems.push(`variable power/toughness (${front.power}/${front.toughness}) played as ${d.power}/${d.toughness}`);
  if (!strictCost(front.mana_cost) && front.mana_cost) problems.push(`mana cost ${front.mana_cost} simplified to ${costStr(d.cost)}`);
  // walk the rules text line by line
  const lines = f ? [] : stripReminder(text).split('\n').map(x => x.trim()).filter(Boolean);
  const unmodelled: string[] = []; const mana: ManaSym[][] = [];
  for (const l of lines) {
    const parts = l.split(/,\s*/).map(x => x.toLowerCase());
    if (parts.every(p => ENGINE_KW.includes(p))) continue;
    const m = parseManaLine(l); if (m) { mana.push(m); continue; }
    if (ETB_TAPPED.test(l) && !/unless|if you/i.test(l)) { d.etbTapped = true; continue; }
    unmodelled.push(l);
  }
  if (mana.length === 1) d.mana = [{ add: mana[0] }];
  else if (mana.length > 1) { // several "{T}: Add {X}" lines = one mana of a choice
    const all = mana.flat(); if (all.every(s => s.length === 1 || s.includes('|')) && mana.every(m => m.length === 1)) d.mana = [{ add: [[...new Set(all.flatMap(s => s.split('|')))].join('|') as ManaSym] }];
    else unmodelled.push('multiple mana abilities');
  }
  if (f) unmodelled.push('(rules text of a multi-face card)');
  if (types.includes('Land') && !d.mana && c.produced_mana?.length) {
    const pm = c.produced_mana.filter(x => 'WUBRGC'.includes(x)); if (pm.length) d.mana = [{ add: [pm.length === 1 ? pm[0] as ManaSym : pm.join('|') as ManaSym] }];
  }
  const unsupportedKw = (c.keywords ?? []).filter(k => !ENGINE_KW.includes(k.toLowerCase()));
  if (!unmodelled.length && !problems.length && (isCreature || d.mana || types.includes('Land'))) return { def: d, support: 'auto' };
  // limited
  const what = types.includes('Instant') || types.includes('Sorcery') ? 'casts with no effect (goes to the graveyard)'
    : isCreature ? `plays as a vanilla ${d.power}/${d.toughness}${kws.length ? ' with ' + kws.join(', ') : ''}`
    : d.mana ? `only "{T}: Add ${d.mana[0].add.map(s => s.split('|').map(x => `{${x}}`).join(' or ')).join('')}" works`
    : 'sits on the battlefield with no effect';
  const why = [unmodelled.length ? `rules text not modelled${unsupportedKw.length ? ` (${unsupportedKw.join(', ')})` : ''}` : '', ...problems].filter(Boolean).join('; ');
  d.limited = `Limited support: ${what}. ${why[0].toUpperCase() + why.slice(1)}.`;
  return { def: d, support: 'limited', reason: `${what[0].toUpperCase() + what.slice(1)}. ${why[0].toUpperCase() + why.slice(1)}.` };
}
export const costStr = (c: Cost) => `${c.generic ? `{${c.generic}}` : ''}${COLORS.map(k => `{${k}}`.repeat(c[k] || 0)).join('')}` || '{0}';
