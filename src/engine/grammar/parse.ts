/** Recursive-descent Oracle parser: tokenize, then parse each line into CardScript IR.
 *  Line dispatch formalizes the current compiler's productions over a token stream.
 *  Leaves (effects, filters, amounts, trigger heads, statics, keywords) reuse the existing
 *  helpers so already-supported wording stays equivalent. This module does not call
 *  `compile()` for the card itself (overload/emblem helpers in oracle.ts may still do so). */
import type { ActAbility, CardDef, Cond, Effect, ManaAbility, Modes, Static, TriggerDef, TSlot } from '../types';
import type { ManaSym } from '../types';
import {
  cleanLine, compile, cond, effects, isKeyword, manaAdd, normalize, num, parseCost,
  parseCosts, parseFilter, parseModes, shortLabel, staticLine, trigger, SUB, pl2,
  type ScryLike, type CompileResult, newCx, setOracleName, oracleName,
} from '../oracle';
import { applyScripts } from '../scripts';
import { liftCardDef } from './lift';
import type { CardScript, ParseFailure, Span } from './types';
import { tokenize, splitTokenLines, guessProduction, type Production, type Token } from './tokenize';
import { retryNativeLeftovers } from './native';

export interface ParseCardResult {
  script: CardScript;
  def: CardDef;
  failures: ParseFailure[];
  unparsed: string[];
  notes: string[];
  ok: boolean;
}

function failureFor(raw: string, line: number, toks: Token[] | undefined, production: Production, reason: string): ParseFailure {
  const span: Span | undefined = toks?.length ? { start: toks[0].start, end: toks[toks.length - 1].end, text: raw } : undefined;
  return { text: raw, reason, line, production, clause: raw, span };
}

/** Parse Oracle text, mutating `d` the way `compile()` does. Records structured failures. */
export function parseInto(sc: ScryLike, d: CardDef, failures: ParseFailure[] = []): CompileResult {

  const unparsed: string[] = []; const notes: string[] = []; setOracleName(sc.name);
  const failAt_ = (raw: string, line: number, toks: Token[], production: Production, reason: string) => {
    unparsed.push(raw);
    failures.push(failureFor(raw, line, toks, production, reason));
  };
  const text = normalize(sc.oracle_text ?? '', sc.name);
  { const ov = /^overload (\{[^}]+\}(?:\{[^}]+\})*)\.?\s*$/m.exec(text); const oc = ov ? parseCost(ov[1].toUpperCase()) : null;
    if (ov && oc && (d.types.includes('Instant') || d.types.includes('Sorcery'))) {
      const body = (sc.oracle_text ?? '').split('\n').filter(l => !/^overload /i.test(l.trim())).join('\n');
      const d2: CardDef = JSON.parse(JSON.stringify(d)); const r2 = parseInto({ ...sc, oracle_text: body.replace(/\btarget\b/gi, 'each') }, d2, failures);
      const r1 = parseInto({ ...sc, oracle_text: body }, d, failures); setOracleName(sc.name);
      if (!r2.unparsed.length && d2.spell && !(d2.spell.target || d2.spell.tslots?.length)) { d.overload = { cost: oc, spell: d2.spell }; return r1; }
      return { ...r1, ok: false, unparsed: [...r1.unparsed, ov[0]] };
    } }
  const rawLines = text.split('\n').map(x => x.trim()).filter(Boolean);
  // join modal bullets
  const lines: string[] = [];
  for (const l of rawLines) { if (l.startsWith('•') && lines.length) lines[lines.length - 1] += '\n' + l; else lines.push(l); }
  const isSpell = d.types.includes('Instant') || d.types.includes('Sorcery');
  const kws = new Set(d.keywords ?? []); const manaLines: ManaAbility[] = [];
  const abilities: ActAbility[] = []; const triggers: TriggerDef[] = []; const statics: Static[] = [];
  let spellFx: Effect[] = []; let spellSlots: TSlot[] = []; let spellModes: Modes | undefined;
  let cls = 0; let lvl: Cond | null = null;
  const ROM: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };
  let lineNo = 0;
  for (const raw of lines) {
    lineNo++;
    const lineToks = tokenize(raw);
    const prod = guessProduction(lineToks);
    const failAt = (reason: string, production: Production = prod) => failAt_(raw, lineNo, lineToks, production, reason);
    let l = cleanLine(raw).replace(/\.$/, '');
    { const fm = /^(?:forecast[ \u2014\u2013-]+)?((?:\{[^}]+\})+), reveal (?:this card|~) from your hand: (.+)$/i.exec(l);
      if (fm) {
        const c = parseCost(fm[1].toUpperCase());
        const fx = effects(fm[2], newCx({ it: 'self' }));
        if (c && fx) { abilities.push({ label: `Forecast ${fm[1].toUpperCase()}`, mana: c, zone: 'hand', once: true, forecast: true, effects: fx }); continue; }
      }
    }
    { const ch = d.sub?.includes('Saga') ? /^((?:i|ii|iii|iv|v|vi|vii)(?:, (?:i|ii|iii|iv|v|vi|vii))*) — (.+)$/s.exec(raw.replace(/\.$/, '')) : null;
      if (ch) { const ns = ch[1].split(', ').map(x => ROM[x]); d.saga = Math.max(d.saga ?? 0, ...ns);
        let body = ch[2];
        const fl = /^(?!choose )([a-z][a-z' !]{0,28} — )(.+)$/s.exec(body);
        if (fl) body = fl[2];
        l = `when §chapter ${ns.join('+')}, ${body}`; } }
    { let x: RegExpExecArray | null;
      if ((x = /^mobilize (\d+)$/.exec(l))) l = `whenever ~ attacks, §mobilize ${x[1]}`;
      else if ((x = /^firebending (\w+(?:, where x is .+)?)$/.exec(l))) l = `whenever ~ attacks, §firebend ${x[1]}`;
      else if (/^job select$/.test(l)) l = 'when ~ enters, §jobselect';
      // The engine has no effects that copy spells, so "cast or copy" triggers only on casts (exact while that holds).
      l = l.replace(/^whenever you cast or copy /, 'whenever you cast ').replace(/^void — /, '').replace(/^vivid — /, '').replace(/^whenever ~ attacks while saddled, /, 'whenever ~ attacks, if ~ is saddled, ').replace(/^whenever ~ attacks while (.+?), /, 'whenever ~ attacks, if $1, ');
      if (/^companion[—\- ]/.test(l)) continue;
      if (/^increment$/.test(l)) l = 'whenever you cast a spell, if §incr, put a +1/+1 counter on ~';
      { const cl = /^(\{[^:]+\}): level (\d+)$/.exec(l); if (cl && d.sub?.includes('Class')) { const c = parseCost(cl[1].toUpperCase()); if (!c) { failAt(`unparsed ${prod} line`); continue; } cls = +cl[2]; abilities.push({ label: `Level ${cls}`, mana: c, sorcery: true, cond: { k: 'ctrEq', kind: 'class', n: cls - 1 }, effects: [{ op: 'classLevel', n: cls }] }); continue; } }
      { const lr = /^level (\d+)(?:-(\d+)|\+)$/.exec(l); if (lr) { lvl = { k: 'ctrIn', kind: 'level', n: +lr[1], max: lr[2] ? +lr[2] : 999 } as Cond; continue; } }
      if (lvl) { const pt = /^(\d+)\/(\d+)$/.exec(l); if (pt) { statics.push({ k: 'pt', who: 'self', p: +pt[1] - (d.power ?? 0), t: +pt[2] - (d.toughness ?? 0), cond: lvl }); continue; } }
      if (cls > 1 && !/^when ~ becomes level/.test(l)) l = `§cond ${l}`;
      if (lvl) l = `§lvl ${l}`;
      if (/^start your engines!?$/.test(l)) { d.engines = true; continue; }
      if (/^station$/.test(l)) { abilities.push({ label: 'Station', sorcery: true, station: true, effects: [{ op: 'addC', kind: 'charge', n: 'X', who: 'self' }] }); continue; }
      const cb = /^(\d+)\+ \| (.+)$/s.exec(l) ?? /^max speed — (.+)$/s.exec(l) ?? /^§cond (.+)$/s.exec(l) ?? /^§lvl (.+)$/s.exec(l);
      if (cb) {
        const thr = cb.length === 3 ? +cb[1] : 0; const body = cb.length === 3 ? cb[2] : cb[1];
        const cond: Cond = thr ? { k: 'ctrGE', kind: 'charge', n: thr } : l.startsWith('§cond') ? { k: 'ctrGE', kind: 'class', n: cls } : l.startsWith('§lvl') ? lvl! : { k: 'maxSpeed' };
        if (thr) d.stationAt = Math.max(d.stationAt ?? 0, thr);
        if (/^§/.test(body)) { failAt(`unparsed ${prod} line`); continue; }
        const owner = oracleName(); const t: CardDef = { id: 'cb', name: d.name, types: d.types, sub: d.sub, cost: { generic: 0 }, colors: [], text: '' };
        const r = compile({ name: sc.name, oracle_text: body, type_line: sc.type_line }, t); setOracleName(owner);
        const bad = !r.ok || t.mana || t.spell || t.ward || t.kicker || t.etbTapped || t.statics?.some(s => s.cond) || t.triggers?.some(x => x.ifc) || t.abilities?.some(a => a.cond);
        if (bad) { failAt(`unparsed ${prod} line`); continue; }
        if (t.keywords?.length) statics.push({ k: 'kw', who: 'self', kws: t.keywords, cond });
        for (const s of t.statics ?? []) statics.push({ ...s, cond });
        for (const x2 of t.triggers ?? []) triggers.push({ ...x2, ifc: cond });
        for (const a of t.abilities ?? []) abilities.push({ ...a, cond });
        continue;
      }
    }
    if (/^if you control a commander, you may cast ~ without paying its mana cost\.?$/.test(l) && !d.types.includes('Land')) { d.freeCmdr = true; continue; }
    if (/^whenever a creature entering under an opponent's control causes a triggered ability of that creature to trigger, you may copy that ability/.test(l)) { d.copyOppEtb = true; continue; }
    // keyword line
    { const fl = /^flashback—(\{[^}]+\}(?:\{[^}]+\})*), pay (\d+) life\.?$/.exec(l); if (fl) { const c = parseCost(fl[1].toUpperCase()); if (c) { d.flashback = c; d.flashbackLife = +fl[2]; continue; } } }
    if (l === 'cascade' || l === 'cascade, cascade') { const times = l.includes(',') ? 2 : 1; const mvv = d.cost.generic + (['W', 'U', 'B', 'R', 'G', 'C'] as const).reduce((a, k) => a + (d.cost[k] ?? 0), 0) + (d.cost.hyb?.length ?? 0); for (let i = 0; i < times; i++) triggers.push({ on: 'x', label: 'Cascade', ev: 'castSelf', subj: 'self', effects: [{ op: 'discover', kind: 'cascade', n: mvv }] } as TriggerDef); continue; }
    if (l === 'demonstrate') { triggers.push({ on: 'x', label: 'Demonstrate', ev: 'castSelf', subj: 'self', effects: [{ op: 'script', kind: 'demonstrate' }] } as TriggerDef); continue; }
    if (l === 'myriad') { kws.add('myriad'); continue; }
    if (l === 'gravestorm') { triggers.push({ on: 'x', label: 'Gravestorm', ev: 'castSelf', subj: 'self', effects: [{ op: 'script', kind: 'gravestorm' }] } as TriggerDef); continue; }
    if (l === 'storm') { d.storm = true; triggers.push({ on: 'x', label: 'Storm', ev: 'castSelf', subj: 'self', effects: [{ op: 'script', kind: 'storm' }] } as TriggerDef); continue; }
    if (l === 'split second') { d.splitSecond = true; kws.add('split second'); continue; }
    { const an = /^annihilator (\d+)$/.exec(l); if (an) { triggers.push({ on: 'x', label: `Annihilator ${an[1]}`, ev: 'attacks', subj: 'self', effects: [{ op: 'script', kind: 'annihilator', n: +an[1] }] } as TriggerDef); continue; } }
    { const eh = /^echo (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(l); if (eh) { const c = parseCost(eh[1].toUpperCase()); if (!c) { failAt(`unparsed ${prod} line`); continue; } d.echo = c; triggers.push({ on: 'x', label: 'Echo', ev: 'upkeep', pl: 'you', effects: [{ op: 'script', kind: 'echo' }] } as TriggerDef); continue; } }
    { const es = /^escape[—\-]?(\{[^}]+\}(?:\{[^}]+\})*), exile (\w+) other cards? from your graveyard$/.exec(l); if (es) { const c = parseCost(es[1].toUpperCase()); if (!c) { failAt(`unparsed ${prod} line`); continue; } d.escape = { cost: c, n: (num(es[2]) as number) }; continue; } }
    { const esc2 = /^~ escapes with (a|an|one|two|three|four|five|six|x|\d+) ([+-]\d\/[+-]\d|[a-z]+) counters? on it$/.exec(l); if (esc2) { d.escapeCtr = { kind: esc2[2], n: num(esc2[1])! }; continue; } }
    const kparts = l.split(/[,;] /);
    if (kparts.every(p => isKeyword(p.trim(), d, kws, abilities, sc))) continue;
    // modal
    let both: Cond | undefined;
    { const bi = /^choose one\. if (.+?), (?:you may )?choose both instead\.?\n(.*)$/s.exec(l); if (bi) { const c = cond(bi[1].replace(/ as you cast ~$/, ''), newCx()); if (!c) { failAt(`unparsed ${prod} line`); continue; } both = c; l = `choose one —\n${bi[2]}`; } }
    { const repM = /^choose (one|two|three|four)\. you may choose the same mode more than once\.\n?(.*)$/s.exec(l); if (repM) l = `choose ${repM[1]} —\n${repM[2]}`; }
    const rep = /you may choose the same mode more than once/.test(raw);
    const mm = /^choose (one|two|three|one or both|one or more|any number|up to (?:one|two|three)) —\n?(.*)$/s.exec(l);
    if (mm) {
      const cx = newCx({ spell: isSpell });
      const ms = parseModes(mm[1], mm[2], cx); if (!ms) { failAt(`unparsed ${prod} line`); continue; }
      if (both) { if (ms.list.length !== 2) { failAt(`unparsed ${prod} line`); continue; } ms.bothIf = both; }
      if (rep) ms.repeat = true;
      if (isSpell) { spellModes = ms; continue; }
      failAt(`unparsed ${prod} line`); continue;
    }
    // planeswalker loyalty
    const lm = /^([+-]?\d+|[+-]x): (.+)$/.exec(l);
    if (lm && d.types.includes('Planeswalker')) {
      const cx = newCx(); const fx = effects(lm[2], cx); if (!fx) { failAt(`unparsed ${prod} line`); continue; }
      abilities.push({ label: `${lm[1].startsWith('+') || lm[1] === '0' ? lm[1] : lm[1]}: ${shortLabel(lm[2])}`, loyalty: lm[1] === 'x' ? 0 : lm[1] === '-x' ? -0 : +lm[1], loyX: lm[1] === '-x' || undefined, effects: fx, tslots: cx.slots.length ? cx.slots : undefined, sorcery: true });
      continue;
    }
    { let x: RegExpExecArray | null;
      if ((x = /^whenever you tap an? ([a-z ]+?) for mana, add an additional \{([wubrgc])\}$/.exec(l))) { const fp = parseFilter(x[1]); if (fp) { statics.push({ k: 'manaExtra', who: 'all', f: { ...fp.f, ctrl: 'you' }, add: [x[2].toUpperCase()] }); continue; } }
      if (/^~ enters prepared$/.test(l)) { d.etbPrepared = true; continue; }
      if ((x = /^as long as ~ isn't on the battlefield, it's an? (\d+)\/(\d+) ([a-z]+) creature in addition to its other types$/.exec(l))) { const sb = SUB.get(x[3]) ?? x[3][0].toUpperCase() + x[3].slice(1); d.offBf = { addTypes: ['Creature'], addSub: [sb], p: +x[1], t: +x[2] }; continue; }
      if (/^as long as ~ is attached to a creature, ~ can't be attacked and has "whenever equipped creature deals combat damage during your turn, put that many loyalty counters on ~\.?"$/.test(l)) {
        statics.push({ k: 'cantBeAttacked', who: 'self', cond: { k: 'attachedCreature' } });
        triggers.push({ on: 'x', label: 'Whenever equipped creature deals combat damage during your turn, put that many loyalty counters on ~.', ev: 'combatDamage', subj: 'attached', ifc: { k: 'yourTurn' }, effects: [{ op: 'addC', kind: 'loyalty', n: 'ev', who: 'self' }] } as TriggerDef); continue; }
    }
    { const sm = /^when you control no (.+?), sacrifice ~$/.exec(l);
      if (sm) { const fp = parseFilter(sm[1]); if (fp) { d.sacIfNo = fp.f; continue; } } }
    // triggered
    const tm = /^(when|whenever|at) (.+?), (.+)$/s.exec(l);
    if (tm && !isSpell) {
      let head = tm[2]; let body = tm[3];
      if (tm[1] === 'at') head = head.replace(/^the beginning of the end step$/, 'the beginning of each end step');
      let once = false;
      body = body.replace(/\. this ability triggers only once each turn$/, () => { once = true; return ''; });
      body = body.replace(/\. do this only once each turn$/, () => { once = true; return ''; });
      const tr = trigger(tm[1] === 'at' ? head : head);
      if (!tr) { failAt(`unparsed ${prod} line`); continue; }
      const cx = newCx(tr.cx);
      let ifc: Cond | undefined;
      const im = /^if (.+?), (.+)$/s.exec(body);
      if (im) { const c = cond(im[1], cx); if (c) { ifc = c; body = im[2]; } }
      const md = /^choose (one|two|one or both|one or more|up to one) —\n?(.*)$/s.exec(body);
      let fx: Effect[] | null = null; let modes: Modes | undefined;
      if (md) { modes = parseModes(md[1], md[2], cx) ?? undefined; if (!modes) { failAt(`unparsed ${prod} line`); continue; } fx = []; }
      else fx = effects(body, cx);
      if (!fx) { failAt(`unparsed ${prod} line`); continue; }
      for (const t of tr.defs) triggers.push({ on: 'x', label: shortLabel(raw), effects: fx, tslots: cx.slots.length && !modes ? cx.slots : undefined, modes, ifc, once: once || undefined, ...t, pl: t.pl ? pl2[t.pl] ?? t.pl : undefined } as TriggerDef);
      continue;
    }
    // activated
    const am = /^([^:"]+): (.+)$/s.exec(l);
    if (am && !isSpell && /\{|sacrifice|discard|pay|remove|exile|tap|put/.test(am[1])) {
      const pc = parseCosts(am[1], sc.name); if (!pc) { failAt(`unparsed ${prod} line`); continue; }
      let body = am[2]; const ab: ActAbility = { label: shortLabel(raw), effects: [], ...pc.ab } as ActAbility;
      { const fl = /^add (.+?)\. ~ doesn't untap during your next untap step$/.exec(body) ?? /^add (.+?); ~ doesn't untap during your next untap step$/.exec(body);
        if (fl) { const r = manaAdd(fl[1], newCx()); if (r && ab.tap && Object.keys(pc.ab).length === 1) { manaLines.push({ add: r.mana, n: r.n, skipNextUntap: true }); continue; } }
        const cop = /^the next time an? (white|blue|black|red|green) source would deal damage to you this turn, prevent that damage$/.exec(body);
        if (cop) { const C: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }; ab.effects = [{ op: 'script', kind: 'preventColor', text: C[cop[1]] }]; abilities.push(ab); continue; }
      }
      body = body.replace(/\. activate (?:this ability )?only as a sorcery$/, () => { ab.sorcery = true; return ''; })
        .replace(/\. activate (?:this ability )?only once each turn$/, () => { ab.once = true; return ''; })
        .replace(/\. activate (?:this ability )?only during your turn$/, () => { ab.cond = { k: 'yourTurn' }; return ''; })
        .replace(/\. activate (?:this ability )?only if (.+)$/, (_, c) => { const cc = cond(c, newCx()); if (!cc) return '§FAIL'; ab.cond = cc; return ''; });
      if (body.includes('§FAIL')) { failAt(`unparsed ${prod} line`); continue; }
      // mana abilities
      let only: string | undefined;
      body = body.replace(/\. if that mana is spent on a dragon creature spell, it gains haste until end of turn$/, () => { only = 'dragonHaste'; return ''; });
      body = body.replace(/\. (?:spend this mana only to (.+)|this mana can't be spent to (?:cast (?:a )?nonartifact spells?|pay generic mana costs))$/, (_, w?: string) => { only = !w ? (/generic mana costs/.test(body) ? 'nongeneric' : 'artifact') : ({ 'cast a creature spell of the chosen type': 'ctypeSpell', 'cast a creature spell of the chosen type or activate an ability of a creature source of the chosen type': 'ctypeAny', 'cast a hero spell or to activate an ability of a hero source': 'hero', 'cast a villain spell or to activate an ability of a villain source': 'villain', 'cast a legendary spell': 'legendary', 'cast an instant or sorcery spell': 'is', 'cast artifact spells or activate abilities of artifacts': undefined, 'cast a creature spell': 'creature', 'cast elemental spells or activate abilities of elemental sources': 'elemental', 'cast an elemental spell or activate an ability of an elemental': 'elemental', 'cast elemental spells or activate abilities of elementals': 'elemental', 'cast an angel spell': 'angel', 'cast a dragon creature spell': 'dragonCreature', 'cast dragon spells or activate abilities of dragons': 'dragon' } as Record<string, string | undefined>)[w] ?? '§'; return ''; });
      body = body.replace(/^(add one mana of any color in your commander's color identity)\. when that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1$/, (_, x) => { only = 'path'; return x; });
      if (only === '§') { failAt(`unparsed ${prod} line`); continue; }
      if (only) { const r = /^add (.+)$/.exec(body) && manaAdd(body.slice(4), newCx()); if (!r || !ab.tap || Object.keys(pc.ab).length !== 1) { failAt(`unparsed ${prod} line`); continue; } manaLines.push({ add: r.mana, n: r.n, only }); continue; }
      const pm = /^add (.+?)\. ~ deals (\d) damage to you$/.exec(body);
      if (pm && ab.tap && Object.keys(pc.ab).length === 1) { const r = manaAdd(pm[1], newCx()); if (r) { manaLines.push({ add: r.mana, n: r.n, pain: +pm[2] }); continue; } }
      const fm = /^add (\{[wubrg]\}\{[wubrg]\}), (\{[wubrg]\}\{[wubrg]\}), or (\{[wubrg]\}\{[wubrg]\})$/.exec(body);
      if (fm && ab.tap && ab.mana?.hyb?.length) { ab.manaAb = true; ab.effects = [{ op: 'script', kind: 'filterMana', text: `${fm[1]}|${fm[2]}|${fm[3]}` }]; abilities.push(ab); continue; }
      const madd = /^add (.+)$/.exec(body);
      if (madd) {
        const r = manaAdd(madd[1], newCx()); if (r) {
        if (ab.tap && Object.keys(pc.ab).length === 1 && !ab.cond) { manaLines.push({ add: r.mana, n: r.n }); continue; }
        if (ab.tap && pc.ab.sac && Object.keys(pc.ab).length === 2 && !r.n && r.mana.length === 1) { manaLines.push({ add: r.mana, sac: true }); continue; }
        ab.manaAb = true; ab.effects = [{ op: 'addMana', mana: r.mana as string[], n: r.n ?? 1 }]; abilities.push(ab); continue;
        }
      }
      const cx = newCx();
      const md = /^choose (one|two|one or both) —\n?(.*)$/s.exec(body);
      if (md) { const ms = parseModes(md[1], md[2], cx); if (!ms) { failAt(`unparsed ${prod} line`); continue; } ab.modes = ms; abilities.push(ab); continue; }
      const fx = effects(body, cx); if (!fx) { failAt(`unparsed ${prod} line`); continue; }
      ab.effects = fx; if (cx.slots.length) ab.tslots = cx.slots;
      abilities.push(ab); continue;
    }
    // spell text
    if (isSpell && (/^(~|this spell) (can't be countered|costs)|^as an additional cost|^cast (?:this spell|~) only /.test(l)) && staticLine(l, d, statics, kws)) continue;
    if (isSpell) {
      const cx = newCx({ spell: true });
      const fx = effects(l, { ...cx, slots: spellSlots, it: spellSlots.length ? 't0' : 'self' });
      if (!fx) { failAt(`unparsed ${prod} line`); continue; }
      spellFx.push(...fx); continue;
    }
    // statics
    if (staticLine(l, d, statics, kws)) continue;
    failAt(`unparsed ${prod} line`);
  }
  // merge mana lines
  if (manaLines.length) {
    if (manaLines.length === 1) d.mana = [manaLines[0]];
    else if (manaLines.every(m => m.add.length === 1 && !m.n && !m.sac && !m.only && !/ANY|IDENTITY|OPP|LEGEND/.test(m.add[0]))) { const pain = Math.max(0, ...manaLines.map(m => m.pain ?? 0)); d.mana = [{ add: [[...new Set(manaLines.flatMap(m => m.add[0].split('|')))].join('|') as ManaSym], pain: pain || undefined }]; if (pain) notes.push('pain: damage is dealt whenever it is tapped for mana, even for {C}'); }
    else d.mana = manaLines;
  }
  if (d.champion) { const ty = d.champion; triggers.push({ on: 'x', ev: 'etb', subj: 'self', label: `Champion a ${ty}`, effects: [{ op: 'champion' }] } as TriggerDef, { on: 'x', ev: 'ltb', subj: 'self', label: `Return the exiled ${ty}`, effects: [{ op: 'championBack' }] } as TriggerDef); }
  if (d.mentor) triggers.push({ on: 'x', ev: 'attacks', subj: 'self', label: 'Mentor', tslots: [{ who: 'perm', f: { types: ['Creature'], attacking: true, other: true, powLTSrc: true } }], effects: [{ op: 'addC', kind: '+1/+1', n: 1, who: 't0' }] } as TriggerDef);
  if (d.evolve) triggers.push({ on: 'x', ev: 'etb', subj: 'other', f: { types: ['Creature'], ctrl: 'you' }, ifc: { k: 'evolve' }, label: 'Evolve', effects: [{ op: 'addC', kind: '+1/+1', n: 1, who: 'self' }] } as TriggerDef);
  if (kws.has('undying')) triggers.push({ on: 'x', ev: 'dies', subj: 'self', ifc: { k: 'noP1P1' }, label: 'Undying', effects: [{ op: 'undying' }] } as TriggerDef);
  if (d.soulbond) triggers.push({ on: 'x', ev: 'etb', subj: 'self', label: 'Soulbond: pair with another unpaired creature you control', effects: [{ op: 'soulPair' }] } as TriggerDef, { on: 'x', ev: 'etb', subj: 'other', f: { types: ['Creature'], ctrl: 'you' }, label: 'Soulbond: you may pair with that creature', effects: [{ op: 'soulPair', who: 'ev' }] } as TriggerDef);
  if (d.impending) triggers.push({ on: 'x', label: 'remove a time counter', ev: 'endStep', pl: 'you', effects: [{ op: 'script', kind: 'remTime' }] });
  if (d.dethrone) triggers.push({ on: 'x', ev: 'attacks', subj: 'self', ifc: { k: 'atkMostLife' }, label: 'Dethrone', effects: [{ op: 'addC', kind: '+1/+1', n: 1, who: 'self' }] } as TriggerDef);
  { const bm = [...kws].map(k => /^bushido (\d+)$/.exec(k)).find(Boolean); if (bm) { const n = +bm[1]; const fx = [{ op: 'pump', n, m: n, who: 'self' as const, until: 'eot' as const }]; triggers.push({ on: 'x', ev: 'blocks', subj: 'self', label: `Bushido ${n}`, effects: fx } as TriggerDef, { on: 'x', ev: 'blocked', subj: 'self', label: `Bushido ${n}`, effects: fx } as TriggerDef); } }
  if (kws.has('flanking')) triggers.push({ on: 'x', ev: 'blocked', subj: 'self', label: 'Flanking', effects: [{ op: 'script', kind: 'flanking' }] } as TriggerDef);
  if (d.modular) triggers.push({ on: 'x', ev: 'dies', subj: 'self', label: 'Modular', tslots: [{ who: 'perm', f: { types: ['Artifact', 'Creature'] }, harm: false, opt: true }], effects: [{ op: 'script', kind: 'modular' }] } as TriggerDef);
  if (d.graft) triggers.push({ on: 'x', ev: 'etb', subj: 'other', f: { types: ['Creature'] }, label: 'Graft', effects: [{ op: 'script', kind: 'graft' }] } as TriggerDef);
  { const rm = [...kws].map(k => /^renown (\d+)$/.exec(k)).find(Boolean); if (rm) triggers.push({ on: 'x', ev: 'combatDamagePlayer', subj: 'self', ifc: { k: 'notRenowned' }, label: `Renown ${rm[1]}`, effects: [{ op: 'script', kind: 'renown', n: +rm[1] }] } as TriggerDef); }
  { const am = [...kws].map(k => /^afterlife (\d+)$/.exec(k)).find(Boolean); if (am) triggers.push({ on: 'x', ev: 'dies', subj: 'self', label: `Afterlife ${am[1]}`, effects: [{ op: 'token', n: +am[1], pl: 'you', tok: { name: 'Spirit', p: 1, t: 1, colors: ['W', 'B'], types: ['Creature'], sub: ['Spirit'], kws: ['flying'] } }] } as TriggerDef); }
  { const af = [...kws].map(k => /^afflict (\d+)$/.exec(k)).find(Boolean); if (af) triggers.push({ on: 'x', ev: 'blocked', subj: 'self', label: `Afflict ${af[1]}`, effects: [{ op: 'lose', n: +af[1], pl: 'def' }] } as TriggerDef); }
  if (d.fabricate) triggers.push({ on: 'x', ev: 'etb', subj: 'self', label: `Fabricate ${d.fabricate}`, effects: [{ op: 'script', kind: 'fabricate', n: d.fabricate }] } as TriggerDef);
  if (d.offspring) triggers.push({ on: 'x', ev: 'etb', subj: 'self', ifc: { k: 'offspringPaid' }, label: 'Offspring', effects: [{ op: 'script', kind: 'offspring' }] } as TriggerDef);
  if (d.extort) triggers.push({ on: 'x', ev: 'cast', pl: 'you', label: 'Extort', effects: [{ op: 'may', text: 'pay {W/B} to extort', ifPaid: { generic: 0, hyb: ['W|B'] }, sub: [{ op: 'script', kind: 'extort' }] }] } as TriggerDef);
  if (kws.has('training')) triggers.push({ on: 'x', ev: 'attacks', subj: 'self', ifc: { k: 'training' }, label: 'Training', effects: [{ op: 'addC', kind: '+1/+1', n: 1, who: 'self' }] } as TriggerDef);
  { const rp = [...kws].map(k => /^rampage (\d+)$/.exec(k)).find(Boolean); if (rp) triggers.push({ on: 'x', ev: 'blocked', subj: 'self', label: `Rampage ${rp[1]}`, effects: [{ op: 'script', kind: 'rampage', n: +rp[1] }] } as TriggerDef); }
  if (kws.has('provoke')) triggers.push({ on: 'x', ev: 'attacks', subj: 'self', label: 'Provoke', tslots: [{ who: 'perm', f: { types: ['Creature'], defP: true }, harm: false, opt: true }], effects: [{ op: 'script', kind: 'provoke' }] } as TriggerDef);
  if (kws.has('ingest')) triggers.push({ on: 'x', ev: 'combatDamagePlayer', subj: 'self', label: 'Ingest', effects: [{ op: 'script', kind: 'ingest' }] } as TriggerDef);
  if (d.forMirrodin) triggers.push({ on: 'x', ev: 'etb', subj: 'self', label: 'For Mirrodin!', effects: [{ op: 'script', kind: 'forMirrodin' }] } as TriggerDef);
  if (d.soulshift) triggers.push({ on: 'x', ev: 'dies', subj: 'self', label: `Soulshift ${d.soulshift}`, tslots: [{ who: 'card', f: { types: ['Creature', 'Spirit'], mvLE: d.soulshift }, zoneOwner: 'you', harm: false, opt: true }], effects: [{ op: 'ret', who: 't0', dest: 'hand', zone: 'graveyard' }] } as TriggerDef);
  if (d.partnerWith) triggers.push({ on: 'x', ev: 'etb', subj: 'self', label: `Partner with ${d.partnerWith}`, tslots: [{ who: 'player', opt: true }], effects: [{ op: 'script', kind: 'partnerWith', text: d.partnerWith }] } as TriggerDef);
  if (d.exploit) triggers.push({ on: 'x', ev: 'etb', subj: 'self', label: 'Exploit', effects: [{ op: 'script', kind: 'exploit' }] } as TriggerDef);
  if (d.storm && !triggers.some(t => t.label === 'Storm')) triggers.push({ on: 'x', label: 'Storm', ev: 'castSelf', subj: 'self', effects: [{ op: 'script', kind: 'storm' }] } as TriggerDef);
  if (d.cumUpkeep) triggers.push({ on: 'x', label: 'Cumulative upkeep', ev: 'upkeep', pl: 'you', effects: [{ op: 'script', kind: 'cumUpkeep' }] } as TriggerDef);
  if (d.fading !== undefined) {
    d.etbCounters = d.etbCounters ?? { kind: 'fade', n: d.fading };
    triggers.push({ on: 'x', label: 'Fading', ev: 'upkeep', pl: 'you', effects: [{ op: 'script', kind: 'fading' }] } as TriggerDef);
  }
  if (d.vanishing !== undefined) {
    d.etbCounters = d.etbCounters ?? { kind: 'time', n: d.vanishing };
    triggers.push({ on: 'x', label: 'Vanishing', ev: 'upkeep', pl: 'you', effects: [{ op: 'script', kind: 'vanishing' }] } as TriggerDef);
  }
  if (d.cipher && (d.types.includes('Instant') || d.types.includes('Sorcery'))) spellFx.push({ op: 'script', kind: 'cipher' });
  if (d.learn && (d.types.includes('Instant') || d.types.includes('Sorcery'))) {
    spellFx.push({ op: 'script', kind: 'learn' });
  }

  retryNativeLeftovers({ d, isSpell, sc, spellFx, spellSlots, triggers, abilities, unparsed, failures });
  if (abilities.length) d.abilities = [...(d.abilities ?? []), ...abilities];
  if (triggers.length) d.triggers = [...(d.triggers ?? []), ...triggers];
  if (statics.length) d.statics = statics;
  if (spellFx.length || spellModes) d.spell = { effects: spellFx, tslots: spellSlots.length ? spellSlots : undefined, modes: spellModes };
  if (d.escalateCost && d.spell?.modes) d.spell.modes.escalateCost = d.escalateCost;
  if (kws.size) d.keywords = [...kws];
  if (d.aura) { const bad = statics.some(s => s.who === 'attached' && ((s.k === 'pt' && typeof s.t === 'number' && s.t < 0) || s.k === 'cantBlock' || s.k === 'cantAttack')); d.aura.harm = bad; if (!bad && d.aura.f && !d.aura.f.ctrl) d.aura = { ...d.aura }; }
  if (isSpell && !d.spell && !triggers.some(t => (t as TriggerDef & { ev?: string }).ev === 'castSelf') && unparsed.length === 0 && text.trim()) {
    unparsed.push('(no effect)');
    failures.push(failureFor('(no effect)', lineNo || 1, undefined, 'spell', 'spell had no compiled effect'));
  }
  if (d.legendary && (d.stationAt || d.sub?.includes('Spacecraft')) && !d.types.includes('Creature')) d.canBeCommander = true;
  d.compiled = true;
  return { unparsed, notes, ok: unparsed.length === 0 };
}


/** Parse a card and merge hand-written line overrides into the IR (applyScripts, then lift). */
export function parseCard(sc: ScryLike, d: CardDef, scriptName = sc.name, oracleId?: string): ParseCardResult {
  const failures: ParseFailure[] = [];
  const res = parseInto(sc, d, failures);
  const unparsed = res.unparsed;
  applyScripts(scriptName, d, unparsed, oracleId ?? sc.oracle_id);
  const still = new Set(unparsed);
  const leftover = failures.filter(f => still.has(f.text));
  const script = liftCardDef(d, { source: 'parser' });
  if (leftover.length) script.failures = leftover;
  return { script, def: d, failures: leftover, unparsed, notes: res.notes, ok: leftover.length === 0 };
}
