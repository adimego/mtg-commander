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
export interface Classified { def: CardDef; support: Support; reason?: string; unparsed?: string[]; failures?: ParseFailure[] }

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

import { applyScripts } from '../engine/scripts';
import { maybeApplyGrammar, parseCard, equivCardDef, grammarRequested, type GrammarOpts, type ParseFailure } from '../engine/grammar';
export function classify(c: ScryCard, opts?: GrammarOpts): Classified {
  const b = builtinByName(c.name); if (b) return maybeApplyGrammar({ def: b, support: 'builtin' }, opts);
  return compileScry(c, opts);
}
/** Compile a Scryfall card with the Oracle-text compiler (no built-in lookup). */
export function compileScry(c: ScryCard, opts?: GrammarOpts): Classified {
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
  if (!isCreature && /\b(Vehicle|Spacecraft)\b/.test(typeLine) && /^\d+$/.test(front.power ?? '')) { d.power = +front.power!; d.toughness = parseInt(front.toughness ?? '0') || 0; }
  if (isCreature) { d.power = /^\d+$/.test(front.power ?? '') ? +front.power! : 0; d.toughness = /^\d+$/.test(front.toughness ?? '') ? +front.toughness! : 0; }
  if (types.includes('Planeswalker') && (front as ScryCard).loyalty) d.loyalty = parseInt((front as ScryCard).loyalty!) || 0;
  if (types.includes('Background')) { d.partner = true; d.canBeCommander = true; }
  const problems: string[] = [];
  let prepUn: string[] = [];
  if (f && c.layout === 'prepare' && f[1]) { const b = compileScry({ ...(f[1] as ScryCard), name: f[1].name, layout: 'normal', card_faces: undefined, colors: (f[1] as ScryCard).colors ?? c.colors, color_identity: c.color_identity, oracle_id: c.oracle_id } as ScryCard, opts); b.def.id = d.id + '--prep'; delete b.def.limited; d.prepDef = b.def; if (b.support !== 'auto') prepUn = (b.unparsed?.length ? b.unparsed : [b.reason ?? 'prepare spell']).map(x => `prepare spell: ${x}`); }
  else if (f && f[1] && ['transform', 'modal_dfc', 'adventure', 'split', 'flip'].includes(c.layout ?? '') && !/Room/.test(c.type_line ?? typeLine)) {
    const bf = f[1] as ScryCard; const b = compileScry({ ...bf, name: bf.name, layout: 'normal', card_faces: undefined, colors: bf.colors ?? c.colors, color_identity: c.color_identity, keywords: [], image_uris: bf.image_uris ?? c.image_uris, oracle_id: c.oracle_id } as ScryCard, opts);
    b.def.id = d.id + '--back'; delete b.def.limited;
    if (c.layout === 'transform' || c.layout === 'flip') b.def.cost = { ...d.cost };
    if (c.layout === 'adventure') b.def.adventure = true;
    if (c.layout === 'modal_dfc') d.mdfc = true;
    if (c.layout === 'split') { d.split = true; if (b.def.fuse) d.fuse = true; }
    if (c.layout === 'flip') { d.flip = true; d.name = front.name ?? d.name; }
    d.back = b.def;
    if (b.support !== 'auto') prepUn = (b.unparsed?.length ? b.unparsed : [b.reason ?? 'back face']).map(x => `${c.layout === 'adventure' ? 'adventure' : c.layout === 'split' ? (b.def.aftermath ? 'aftermath' : 'back half') : 'back face'}: ${x}`);
  }
  else if (f && f.length >= 2 && /Room/.test(c.type_line ?? typeLine)) {
    const doors = f.map((face, i) => {
      const fc = compileScry({ ...(face as ScryCard), name: face.name ?? c.name, layout: 'normal', card_faces: undefined, colors: (face as ScryCard).colors ?? c.colors, color_identity: c.color_identity, keywords: (face as ScryCard).keywords ?? [], image_uris: face.image_uris ?? c.image_uris, oracle_id: c.oracle_id } as ScryCard, opts);
      const fd = fc.def; delete fd.limited;
      for (const a of fd.abilities ?? []) a.door = i;
      for (const st of fd.statics ?? []) st.door = i;
      for (const m of fd.mana ?? []) m.door = i;
      for (const tr of fd.triggers ?? []) { tr.door = i; if (tr.ev === 'unlock') tr.ifc = { k: 'evAmt', n: i }; }
      if (fc.support !== 'auto') prepUn.push(...(fc.unparsed?.length ? fc.unparsed : [fc.reason ?? `door ${i}`]).map(x => `${face.name}: ${x}`));
      return { name: fd.name, cost: fd.cost, abilities: fd.abilities, triggers: fd.triggers, statics: fd.statics, mana: fd.mana, img: fd.img, art: fd.art };
    });
    d.types = ['Enchantment']; d.sub = ['Room']; d.room = { doors };
    d.abilities = doors.flatMap(x => x.abilities ?? []);
    d.triggers = doors.flatMap(x => x.triggers ?? []);
    d.statics = doors.flatMap(x => x.statics ?? []);
    d.mana = doors.flatMap(x => x.mana ?? []);
    d.cost = { generic: 0 };
    // Faces were compiled as their own cards; skip a second compile of the joined text.
  }
  else if (f) problems.push(`${c.layout ?? 'multi-face'} card: only the front face is used`);
  if (!exact && front.mana_cost && !d.room) problems.push(`mana cost ${front.mana_cost} simplified to ${costStr(d.cost)}`);
  const scryLike = { ...front, name: f ? front.name ?? c.name : c.name, oracle_text: front.oracle_text ?? (f ? '' : c.oracle_text), oracle_id: c.oracle_id } as ScryLike;
  let failures: ParseFailure[] | undefined;
  let res: { unparsed: string[] };
  if (d.room) {
    res = { unparsed: [] as string[] };
  } else if (grammarRequested(opts)) {
    const seed = cloneDef(d);
    const parsed = parseCard(scryLike, d, c.name, c.oracle_id);
    failures = parsed.failures;
    res = { unparsed: parsed.unparsed };
    if (opts?.fallback !== false) {
      const dOld = cloneDef(seed);
      const old = compile(scryLike, dOld);
      applyScripts(c.name, dOld, old.unparsed, c.oracle_id);
      // Keep the parser when it is equivalent or better (accepted a line the old compiler leftover).
      // Fall back only when the parser failed a line the old compiler accepted.
      if (parserWorse(parsed.unparsed, old.unparsed)) {
        replaceDef(d, dOld);
        res = { unparsed: old.unparsed };
        failures = undefined;
      }
    }
  } else {
    res = compile(scryLike, d);
    applyScripts(c.name, d, res.unparsed, c.oracle_id);
  }
  if (pStar && !d.statics?.some(s => s.k === 'pt' && s.who === 'self' && (typeof s.p !== 'number' || typeof s.t !== 'number'))) { if (!d.toughness) d.toughness = 1; problems.push(`variable power/toughness (${front.power}/${front.toughness}) played as ${d.power}/${d.toughness}`); }
  const basicT: Record<string, string> = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };
  const intrinsic = (d.sub ?? []).map(t => basicT[t]).filter(Boolean);
  if (types.includes('Land') && intrinsic.length) { const add = (intrinsic.length === 1 ? intrinsic[0] : intrinsic.join('|')) as ManaSym; d.mana = d.mana ? [{ ...d.mana[0], add: [[...new Set([...d.mana[0].add[0].split('|'), ...intrinsic])].join('|') as ManaSym] }] : [{ add: [add] }]; }
  if (types.includes('Land') && !d.mana && c.produced_mana?.length && res.unparsed.length) {
    const pm = c.produced_mana.filter(x => 'WUBRGC'.includes(x)); if (pm.length) d.mana = [{ add: [pm.length === 1 ? pm[0] as ManaSym : pm.join('|') as ManaSym] }];
  }
  if ((d.sub?.includes('Saga') && !d.saga) || (d.sub?.includes('Vehicle') && /\bcrew \d/i.test(d.text ?? '') && !d.abilities?.some(a => a.crew !== undefined))) problems.push(`${d.sub?.includes('Saga') ? 'Saga chapters' : 'crewing'} not modelled`);
  // "Add X. Threshold — Add Y instead if ..." must be if/else, not both.
  { const fx = d.spell?.effects; if (fx && fx.length >= 2) { const last = fx[fx.length - 1]; if (last.op === 'if' && !last.else && fx.slice(0, -1).every(e => e.op === 'addMana')) d.spell!.effects = [{ op: 'if', cond: last.cond, sub: last.sub, else: fx.slice(0, -1) }]; } }
  res.unparsed.push(...prepUn);
  if (!res.unparsed.length && !problems.length) return maybeApplyGrammar({ def: d, support: 'auto', failures }, opts);
  const works = describeWorks(d);
  const why = formatLimitedWhy(res.unparsed, c.name, problems, failures);
  d.limited = `Limited support: ${works}. ${why[0].toUpperCase() + why.slice(1)}.`;
  return maybeApplyGrammar({ def: d, support: 'limited', reason: `${works[0].toUpperCase() + works.slice(1)}. ${why[0].toUpperCase() + why.slice(1)}.`, unparsed: res.unparsed, failures }, opts);
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


/** True when the parser leftover a line the old compiler accepted. */
export function parserWorse(parserUnparsed: string[], oldUnparsed: string[]): boolean {
  const old = new Set(oldUnparsed.map(x => x.replace(/\.$/, '')));
  return parserUnparsed.some(x => !old.has(x.replace(/\.$/, '')));
}

/** Limited-support reason: leftover lines first, then the failing clause / parse reason when present. */
export function formatLimitedWhy(unparsed: string[], name: string, problems: string[] = [], failures?: ParseFailure[]): string {
  const un = unparsed.length ? formatUnparsedReason(unparsed, name, failures) : '';
  return [un, ...problems].filter(Boolean).join('; ');
}

export function formatUnparsedReason(unparsed: string[], name: string, failures?: ParseFailure[]): string {
  const bits = unparsed.slice(0, 3).map(x => {
    const prettyX = pretty(x, name);
    const trunc = prettyX.length > 70 ? prettyX.slice(0, 67) + '…' : prettyX;
    const f = failures?.find(ff => ff.text === x);
    const hint = f ? formatFailureHint(f, prettyX) : '';
    return `"${trunc}"${hint}`;
  });
  return `not modelled: ${bits.join(' / ')}${unparsed.length > 3 ? ` (+${unparsed.length - 3} more)` : ''}`;
}

function formatFailureHint(f: ParseFailure, prettyLine: string): string {
  const clause = f.clause && f.clause !== f.production && f.clause !== f.text ? f.clause : undefined;
  const bits: string[] = [];
  if (clause && clause !== prettyLine) bits.push(clause);
  if (f.reason) bits.push(f.reason);
  else if (f.production) bits.push(f.production);
  return bits.length ? ` (${bits.join(': ')})` : '';
}

function cloneDef(d: CardDef): CardDef { return JSON.parse(JSON.stringify(d)) as CardDef; }
function replaceDef(dst: CardDef, src: CardDef): void {
  for (const k of Object.keys(dst) as (keyof CardDef)[]) delete dst[k];
  Object.assign(dst, src);
}

/** Compile a Scryfall card through the grammar parser with no old-compiler fallback. */
export function parseScry(c: ScryCard): Classified {
  return compileScry(c, { grammar: true, fallback: false });
}
