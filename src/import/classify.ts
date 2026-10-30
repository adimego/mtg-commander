/** Turn Scryfall cards into engine CardDefs and classify how well the engine supports them. Honest by design:
 *  - 'builtin': the card already exists in the hand-modelled pool (full rules support).
 *  - 'auto':    every line of its rules text is something the engine models generically (supported keywords,
 *               "{T}: Add ..." mana abilities, "enters tapped"), so it plays exactly as printed.
 *  - 'limited': anything else. It plays as a vanilla permanent (printed P/T + supported keywords) or a spell
 *               with no effect, and is badged "Limited support" in game. */
import { CARDS, CardDef, Color, Cost, ManaSym, COLORS } from '../engine/engine';
import type { ScryCard } from './scryfall';
import { compile, parseCost, pretty, type ScryLike } from '../engine/oracle';

export { KWS as ENGINE_KW } from '../engine/oracle';
export type Support = 'builtin' | 'auto' | 'limited';
export interface Classified { def: CardDef; support: Support; reason?: string; unparsed?: string[] }

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
  return compileScry(c);
}
/** Compile a Scryfall card with the Oracle-text compiler (no built-in lookup). */
export function compileScry(c: ScryCard): Classified {
  const f = faces(c); const front = f?.[0] ?? c;
  const typeLine = front.type_line ?? c.type_line;
  const types = typeLine.split('—')[0].trim().split(/\s+/).filter(t => !['Legendary', 'Basic', 'Snow', 'World', 'Tribal', 'Kindred', 'Ongoing'].includes(t));
  const { img, art } = images(c);
  const text = f ? f.map(x => x.oracle_text ?? '').join('\n//\n') : c.oracle_text ?? '';
  const exact = parseCost(front.mana_cost ?? '');
  const d: CardDef = { id: 'x-' + slug(c.name), name: c.name, types, cost: exact ?? lenientCost(front.mana_cost), colors: (c.colors ?? (front as ScryCard).colors ?? []) as Color[], typeLine: c.type_line, text, img, art, identity: c.color_identity as Color[] };
  if (/\bLegendary\b/.test(typeLine)) d.legendary = true;
  if (/\bBasic\b/.test(typeLine)) d.basic = true;
  const sub = typeLine.split('—')[1]?.trim().split(/\s+/); if (sub?.length) d.sub = sub;
  const isCreature = types.includes('Creature');
  const pStar = isCreature && !(/^\d+$/.test(front.power ?? '') && /^\d+$/.test(front.toughness ?? ''));
  if (isCreature) { d.power = parseInt(front.power ?? '0') || 0; d.toughness = parseInt(front.toughness ?? '0') || 0; }
  if (types.includes('Planeswalker') && (front as ScryCard).loyalty) d.loyalty = parseInt((front as ScryCard).loyalty!) || 0;
  if (types.includes('Background')) { d.partner = true; d.canBeCommander = true; }
  const problems: string[] = [];
  if (f) problems.push(`${c.layout ?? 'multi-face'} card: only the front face is used`);
  if (!exact && front.mana_cost) problems.push(`mana cost ${front.mana_cost} simplified to ${costStr(d.cost)}`);
  const res = compile({ ...front, name: c.name, oracle_text: front.oracle_text ?? (f ? '' : c.oracle_text) } as ScryLike, d);
  if (pStar && !d.statics?.some(s => s.k === 'pt' && s.who === 'self' && typeof s.p !== 'number')) { if (!d.toughness) d.toughness = 1; problems.push(`variable power/toughness (${front.power}/${front.toughness}) played as ${d.power}/${d.toughness}`); }
  const basicT: Record<string, string> = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };
  const intrinsic = (d.sub ?? []).map(t => basicT[t]).filter(Boolean);
  if (types.includes('Land') && intrinsic.length) { const add = (intrinsic.length === 1 ? intrinsic[0] : intrinsic.join('|')) as ManaSym; d.mana = d.mana ? [{ ...d.mana[0], add: [[...new Set([...d.mana[0].add[0].split('|'), ...intrinsic])].join('|') as ManaSym] }] : [{ add: [add] }]; }
  if (types.includes('Land') && !d.mana && c.produced_mana?.length && res.unparsed.length) {
    const pm = c.produced_mana.filter(x => 'WUBRGC'.includes(x)); if (pm.length) d.mana = [{ add: [pm.length === 1 ? pm[0] as ManaSym : pm.join('|') as ManaSym] }];
  }
  if (types.includes('Saga') || types.includes('Vehicle') || d.sub?.includes('Saga') || d.sub?.includes('Vehicle')) problems.push(`${d.sub?.includes('Saga') ? 'Saga chapters' : 'crewing'} not modelled`);
  if (!res.unparsed.length && !problems.length) return { def: d, support: 'auto' };
  const works = describeWorks(d);
  const why = [res.unparsed.length ? `not modelled: "${res.unparsed.slice(0, 3).map(x => pretty(x, c.name)).map(x => x.length > 70 ? x.slice(0, 67) + '…' : x).join('" / "')}"${res.unparsed.length > 3 ? ` (+${res.unparsed.length - 3} more)` : ''}` : '', ...problems].filter(Boolean).join('; ');
  d.limited = `Limited support: ${works}. ${why[0].toUpperCase() + why.slice(1)}.`;
  return { def: d, support: 'limited', reason: `${works[0].toUpperCase() + works.slice(1)}. ${why[0].toUpperCase() + why.slice(1)}.`, unparsed: res.unparsed };
}
function describeWorks(d: CardDef): string {
  const parts: string[] = [];
  const n = (d.abilities?.length ?? 0) + (d.triggers?.length ?? 0) + (d.statics?.length ?? 0) + (d.spell ? 1 : 0) + (d.mana ? 1 : 0);
  if (n) parts.push(`${n} of its abilit${n === 1 ? 'y works' : 'ies work'}`);
  else if (d.types.includes('Instant') || d.types.includes('Sorcery')) parts.push('casts with no effect');
  else if (d.types.includes('Creature')) parts.push(`plays as a ${d.power}/${d.toughness}${d.keywords?.length ? ' with ' + d.keywords.join(', ') : ''}`);
  else parts.push('sits on the battlefield');
  return parts.join(', ');
}
export const costStr = (c: Cost) => `${c.generic ? `{${c.generic}}` : ''}${COLORS.map(k => `{${k}}`.repeat(c[k] || 0)).join('')}` || '{0}';
