/** Deep-compare CardDefs for the golden harness: ignore key insertion order; treat missing and undefined as equal. */
import type { CardDef } from '../types';

/** Canonical JSON for comparison (sorted keys, undefined dropped). */
export function normalizeValue(v: unknown): unknown {
  if (v === undefined) return undefined;
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(normalizeValue);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as object).sort()) {
    const n = normalizeValue((v as Record<string, unknown>)[k]);
    if (n !== undefined) out[k] = n;
  }
  return out;
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizeValue(a)) === JSON.stringify(normalizeValue(b));
}

export function sameCardDef(a: CardDef, b: CardDef): boolean {
  return sameValue(a, b);
}

/** Human-readable paths where two values differ (capped). */
export function diffValue(a: unknown, b: unknown, path = '$', out: string[] = [], cap = 20): string[] {
  if (out.length >= cap) return out;
  if (sameValue(a, b)) return out;
  const na = normalizeValue(a);
  const nb = normalizeValue(b);
  const ta = na === undefined ? 'undefined' : na === null ? 'null' : Array.isArray(na) ? 'array' : typeof na;
  const tb = nb === undefined ? 'undefined' : nb === null ? 'null' : Array.isArray(nb) ? 'array' : typeof nb;
  if (ta !== tb) {
    out.push(`${path}: ${ta} vs ${tb}`);
    return out;
  }
  if (ta !== 'object' && ta !== 'array') {
    out.push(`${path}: ${JSON.stringify(na)} vs ${JSON.stringify(nb)}`);
    return out;
  }
  if (ta === 'array') {
    const aa = na as unknown[];
    const bb = nb as unknown[];
    if (aa.length !== bb.length) out.push(`${path}.length: ${aa.length} vs ${bb.length}`);
    const n = Math.max(aa.length, bb.length);
    for (let i = 0; i < n && out.length < cap; i++) diffValue(aa[i], bb[i], `${path}[${i}]`, out, cap);
    return out;
  }
  const oa = (na ?? {}) as Record<string, unknown>;
  const ob = (nb ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(oa), ...Object.keys(ob)])].sort();
  for (const k of keys) {
    if (out.length >= cap) break;
    diffValue(oa[k], ob[k], `${path}.${k}`, out, cap);
  }
  return out;
}

export function diffCardDef(a: CardDef, b: CardDef, cap = 20): string[] {
  return diffValue(a, b, '$', [], cap);
}

/** Amount / small-shape equivalences the parser may emit vs the old compiler. */
export function equivValue(a: unknown, b: unknown): boolean {
  if (sameValue(a, b)) return true;
  const na = normalizeValue(a);
  const nb = normalizeValue(b);
  return equivNormalized(na, nb);
}

function equivNormalized(a: unknown, b: unknown): boolean {
  if (sameValue(a, b)) return true;
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined || a === null || b === null) return a === b;
  // 2 and { plus: 0, of: 2 } / { mul: 1, of: 2 }
  if (typeof a === 'number' && isObj(b)) return amountEquals(a, b) || amountEquals(b, a);
  if (typeof b === 'number' && isObj(a)) return amountEquals(a, b);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => equivNormalized(x, b[i]));
  }
  if (isObj(a) && isObj(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!equivNormalized(a[k], b[k])) return false;
    return true;
  }
  return false;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function amountEquals(a: unknown, b: unknown): boolean {
  if (sameValue(a, b)) return true;
  if (typeof a === 'number' && isObj(b)) {
    if (Object.keys(b).length === 1 && typeof b.plus === 'number' && amountEquals(a - (b.plus as number), b.of)) return true;
    if (Object.keys(b).length === 1 && b.mul === 1 && amountEquals(a, b.of)) return true;
    if (Object.keys(b).length === 1 && b.plus === 0 && amountEquals(a, b.of)) return true;
  }
  if (typeof b === 'number' && isObj(a)) return amountEquals(b, a);
  return false;
}

export function equivCardDef(a: CardDef, b: CardDef): boolean {
  return equivValue(a, b);
}
