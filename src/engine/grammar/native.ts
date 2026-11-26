/** Second-pass token-native sentence parser for leftover lines the first (parity) loop rejected. */
import type { ActAbility, CardDef, Effect, TSlot, TriggerDef } from '../types';
import { parseCosts, trigger, type ScryLike } from '../oracle';
import type { ParseFailure } from './types';
import { tokenize, guessProduction, type Production, type Token } from './tokenize';
import { Cursor } from './cursor';
import { applyWrappers, parseWrappers } from './leaves';
import { parseNativeVerb } from './verbs';

export interface NativeCtx {
  d: CardDef;
  isSpell: boolean;
  sc: ScryLike;
  spellFx: Effect[];
  spellSlots: TSlot[];
  triggers: TriggerDef[];
  abilities: ActAbility[];
  unparsed: string[];
  failures: ParseFailure[];
}

/** Try to parse leftover lines as composed wrappers + a simple verb. Mutates ctx on hits. */
export function retryNativeLeftovers(ctx: NativeCtx): void {
  for (let i = ctx.unparsed.length - 1; i >= 0; i--) {
    const raw = ctx.unparsed[i];
    if (raw === '(no effect)') continue;
    const hit = parseNativeLine(raw, ctx);
    if (!hit) continue;
    if (!applyNativeHit(raw, hit, ctx)) continue;
    ctx.unparsed.splice(i, 1);
    const fi = ctx.failures.findIndex(f => f.text === raw);
    if (fi >= 0) ctx.failures.splice(fi, 1);
  }
}

export interface NativeHit {
  effects: Effect[];
  slots: TSlot[];
  production: Production;
  trigger?: Partial<TriggerDef>;
  ability?: Partial<ActAbility>;
}

/** Try to parse one leftover normalized line as composed wrappers + a simple verb. */
export function parseNativeLine(raw: string, ctx: Pick<NativeCtx, 'isSpell' | 'sc'>): NativeHit | null {
  const toks = tokenize(raw.replace(/\.$/, '')).filter(t => t.kind !== 'abilityWord' && t.kind !== 'newline');
  if (!toks.length) return null;
  const prod = guessProduction(toks);

  if (prod === 'triggered' && !ctx.isSpell) {
    const c0 = new Cursor(toks);
    const kind = c0.peekText();
    if (!c0.eat('when', 'whenever', 'at')) return null;
    let comma = -1;
    for (let i = c0.i; i < c0.tokens.length; i++) {
      if (c0.tokens[i].kind === 'punct' && c0.tokens[i].text === ',') { comma = i; break; }
    }
    if (comma < 0) return null;
    let head = new Cursor(c0.tokens.slice(c0.i, comma)).remainingText();
    if (kind === 'at') head = head.replace(/^the beginning of the end step$/, 'the beginning of each end step');
    const tr = trigger(kind === 'at' ? head : head);
    if (!tr) return null;
    const parsed = parseEffectSentences(c0.tokens.slice(comma + 1));
    if (!parsed) return null;
    const def: Partial<TriggerDef> = { ...tr.defs[0], effects: parsed.effects };
    const mergedSlots = [...(tr.cx.slots ?? []), ...parsed.slots];
    if (mergedSlots.length) def.tslots = mergedSlots;
    return { effects: parsed.effects, slots: parsed.slots, production: 'triggered', trigger: def };
  }

  if (prod === 'activated' && !ctx.isSpell) {
    const colon = toks.findIndex(t => t.kind === 'punct' && t.text === ':');
    if (colon < 0) return null;
    const costText = new Cursor(toks.slice(0, colon)).remainingText();
    const pc = parseCosts(costText, ctx.sc.name);
    if (!pc) return null;
    const parsed = parseEffectSentences(toks.slice(colon + 1));
    if (!parsed) return null;
    const ab: Partial<ActAbility> = { ...pc.ab, effects: parsed.effects, label: pc.ab.label ?? costText };
    const slots = [...parsed.slots];
    if (slots.length) ab.tslots = slots;
    return { effects: parsed.effects, slots, production: 'activated', ability: ab };
  }

  const parsed = parseEffectSentences(toks);
  if (!parsed) return null;
  return { effects: parsed.effects, slots: parsed.slots, production: ctx.isSpell ? 'spell' : prod };
}

function parseEffectSentences(toks: Token[]): { effects: Effect[]; slots: TSlot[] } | null {
  const parts: Token[][] = [];
  let cur: Token[] = [];
  for (const t of toks) {
    if (t.kind === 'punct' && t.text === '.') { if (cur.length) parts.push(cur); cur = []; continue; }
    if (t.kind === 'word' && t.text === 'then' && cur.length) { parts.push(cur); cur = []; continue; }
    cur.push(t);
  }
  if (cur.length) parts.push(cur);
  if (!parts.length) return null;
  const effects: Effect[] = [];
  const slots: TSlot[] = [];
  for (const part of parts) {
    const wrap = parseWrappers(part);
    const verb = parseNativeVerb(wrap.inner, { slots });
    if (!verb) return null;
    effects.push(...applyWrappers(verb.effects, wrap.wrap));
    if (verb.slots) slots.push(...verb.slots);
  }
  return { effects, slots };
}

function applyNativeHit(raw: string, hit: NativeHit, ctx: NativeCtx): boolean {
  void raw;
  if (hit.trigger) {
    ctx.triggers.push(hit.trigger as TriggerDef);
    return true;
  }
  if (hit.ability) {
    ctx.abilities.push(hit.ability as ActAbility);
    return true;
  }
  if (ctx.isSpell) {
    ctx.spellFx.push(...hit.effects);
    ctx.spellSlots.push(...hit.slots);
    return true;
  }
  // Permanent leftover with no trigger/activation — don't invent a zone or drop unparsed.
  return false;
}
