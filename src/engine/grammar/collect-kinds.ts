/** Collect Effect.op literals and exec() case labels so EFFECT_KINDS stays their union. */
import { EFFECT_KIND_SET } from './kinds';

export function collectEffectKindSources(oracleSrc: string, engineSrc: string): { literals: string[]; execCases: string[]; union: string[] } {
  const literals = new Set<string>();
  for (const m of oracleSrc.matchAll(/\bop:\s*'([^']+)'/g)) literals.add(m[1]);
  for (const m of oracleSrc.matchAll(/\be\.op\s*===\s*'([^']+)'/g)) literals.add(m[1]);
  const start = engineSrc.indexOf('switch (e.op)');
  const execCases = new Set<string>();
  if (start >= 0) {
    let i = engineSrc.indexOf('{', start), depth = 0, end = i;
    for (let k = i; k < engineSrc.length; k++) {
      if (engineSrc[k] === '{') depth++;
      else if (engineSrc[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
    }
    for (const m of engineSrc.slice(i, end + 1).matchAll(/case '([^']+)':/g)) execCases.add(m[1]);
  }
  const union = [...new Set([...literals, ...execCases])].sort();
  return { literals: [...literals].sort(), execCases: [...execCases].sort(), union };
}

export function kindsMissingFromList(oracleSrc: string, engineSrc: string): string[] {
  return collectEffectKindSources(oracleSrc, engineSrc).union.filter(k => !EFFECT_KIND_SET.has(k));
}

export function extraKindsOnList(oracleSrc: string, engineSrc: string): string[] {
  const { union } = collectEffectKindSources(oracleSrc, engineSrc);
  const u = new Set(union);
  return [...EFFECT_KIND_SET].filter(k => !u.has(k)).sort();
}
