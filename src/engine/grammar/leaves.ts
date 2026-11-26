/** Token-native composing leaves used by P2 verb productions: amount, duration, player, filter, target, wrappers. */
import type { Amt, Color, Cond, Effect, Filter, PRef, Ref, TSlot } from '../types';
import { cond as parseCond, newCx, num, parseFilter, type FP } from '../oracle';
import type { Token } from './tokenize';
import { Cursor } from './cursor';

const COLOR_OF: Record<string, Color> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };

export type Duration = Effect['until'];

export function parseAmount(c: Cursor): Amt | null {
  const t = c.peek();
  if (!t) return null;
  if (t.kind === 'number') { c.eatKind('number'); return +t.text; }
  if (t.kind === 'word' || t.kind === 'keyword') {
    const n = num(t.text);
    if (n === 'X') { c.i++; return 'X'; }
    if (typeof n === 'number') { c.i++; return n; }
  }
  if (c.eatPhrase('that', 'much') || c.eatPhrase('that', 'many')) return 'that';
  return null;
}

export function parseDuration(c: Cursor): Duration | undefined {
  const t = c.peek();
  if (!t || t.kind !== 'until') return undefined;
  c.eatKind('until');
  if (/next turn/.test(t.text)) return 'yourNext';
  return 'eot';
}

export function parsePlayerRef(c: Cursor): PRef | null {
  if (c.eatPhrase('each', 'opponent') || c.eatPhrase('each', 'other', 'player') || c.eatPhrase('your', 'opponents')) return 'opps';
  if (c.eatPhrase('target', 'opponent')) return 't0';
  if (c.eatPhrase('target', 'player')) return 't0';
  if (c.eatPhrase('each', 'player')) return 'all';
  if (c.eat('you')) return 'you';
  return null;
}

/** Noun-phrase filter. Consumes the rest of the cursor via `parseFilter` on the remaining text. */
export function parseFilterPhrase(c: Cursor): FP | null {
  const text = c.remainingText().replace(/\.+$/, '').trim();
  if (!text) return { f: {} };
  const fp = parseFilter(text);
  if (!fp) return null;
  c.i = c.tokens.length;
  return fp;
}

export interface ParsedTarget {
  slots: TSlot[];
  who: Ref;
  filter?: Filter;
  each?: boolean;
}

function slotWho(fp: FP): TSlot['who'] {
  if (fp.f.types?.includes('Player') || fp.f.types?.includes('Opponent')) return 'player';
  if (fp.card) return 'card';
  if (fp.spell) return 'spell';
  return 'perm';
}

export function parseTarget(c: Cursor, harm = false): ParsedTarget | null {
  const opt = c.eatPhrase('up', 'to');
  const amt = parseAmount(c);
  const n = typeof amt === 'number' ? amt : null;

  if (c.eat('each') || c.eat('all') || c.eat('every')) {
    const fp = parseFilterPhrase(c);
    if (!fp) return null;
    return { slots: [], who: { all: fp.f }, filter: fp.f, each: true };
  }

  const anyTarget = c.eatPhrase('any', 'target') || c.eatPhrase('target', 'any');
  if (anyTarget) {
    const count = n ?? 1;
    const slots: TSlot[] = [];
    for (let i = 0; i < count; i++) slots.push({ who: 'any', harm, opt: opt || count > 1 });
    return { slots, who: 't0' };
  }

  const targeted = !!c.eat('target');
  if (c.eatKind('self') || c.eat('it') || c.eatPhrase('this', 'creature') || c.eatPhrase('this', 'permanent')) {
    return { slots: [], who: 'self' };
  }
  if (targeted || opt || n != null) {
    const fp = parseFilterPhrase(c);
    if (!fp) return null;
    const count = n ?? 1;
    const who = slotWho(fp);
    const slots: TSlot[] = [];
    for (let i = 0; i < count; i++) slots.push({ who, f: Object.keys(fp.f).length ? fp.f : undefined, harm, opt: opt || count > 1 });
    return { slots, who: 't0', filter: fp.f };
  }
  return null;
}

export function parseOptionalYouMay(c: Cursor): boolean {
  return !!(c.eatPhrase('you', 'may') || c.eatPhrase('its', 'controller', 'may'));
}

export interface Wrapper {
  may?: boolean;
  until?: Duration;
  condText?: string;
}

/** Strip common wrappers; returns the inner cursor on the verb phrase plus wrapper flags. */
export function parseWrappers(tokens: Token[]): { inner: Cursor; wrap: Wrapper } {
  const filtered = tokens.filter(t => t.kind !== 'abilityWord' && t.kind !== 'newline' && !(t.kind === 'punct' && t.text === '.'));
  const c = new Cursor(filtered);
  const wrap: Wrapper = {};
  if (parseOptionalYouMay(c)) wrap.may = true;
  if (c.eat('if')) {
    const start = c.i;
    let comma = -1;
    for (let i = c.i; i < c.tokens.length; i++) {
      if (c.tokens[i].kind === 'punct' && c.tokens[i].text === ',') { comma = i; break; }
    }
    if (comma >= 0) {
      wrap.condText = new Cursor(c.tokens.slice(start, comma)).remainingText();
      c.i = comma + 1;
    }
  }
  const last = c.tokens[c.tokens.length - 1];
  if (last?.kind === 'until') {
    wrap.until = /next turn/.test(last.text) ? 'yourNext' : 'eot';
    let end = c.tokens.length - 1;
    if (c.tokens[end - 1]?.kind === 'punct' && c.tokens[end - 1].text === ',') end--;
    c.tokens = c.tokens.slice(0, end);
  }
  return { inner: c, wrap };
}

export function applyWrappers(fx: Effect[], wrap: Wrapper): Effect[] {
  let out = fx;
  if (wrap.until) for (const e of out) if (!e.until) e.until = wrap.until;
  if (wrap.condText) {
    const cnd = parseCond(wrap.condText, newCx());
    if (cnd) out = [{ op: 'if', cond: cnd, sub: out }];
  }
  if (wrap.may) out = [{ op: 'may', sub: out }];
  return out;
}

export { COLOR_OF, parseCond };
