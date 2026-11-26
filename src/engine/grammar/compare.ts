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
