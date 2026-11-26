/** Hash-keyed line overrides: `oracle_id` + normalized-line hash, with name+text left to `applyScripts`. */

export type LinePatch = (d: import('../types').CardDef) => void;

/** Stable 16-char hex hash of a normalized leftover line (trailing period stripped). */
export function lineHash(line: string): string {
  const s = line.replace(/\.$/, '').trim();
  let a = 5381, b = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    a = Math.imul(a, 33) ^ ch;
    b = (Math.imul(b, 65599) + ch) >>> 0;
  }
  return (a >>> 0).toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

const byOracle = new Map<string, Map<string, LinePatch>>();

function looksLikeHash(s: string): boolean {
  return /^[0-9a-f]{16}$/.test(s);
}

/** Register a per-line override under `oracle_id` + hash (hash or raw normalized line). */
export function registerLineOverride(oracleId: string, hashOrLine: string, patch: LinePatch): void {
  const h = looksLikeHash(hashOrLine) ? hashOrLine : lineHash(hashOrLine);
  let m = byOracle.get(oracleId);
  if (!m) { m = new Map(); byOracle.set(oracleId, m); }
  m.set(h, patch);
}

export function clearLineOverrides(): void {
  byOracle.clear();
}

export function lookupLineOverride(oracleId: string | undefined, line: string): LinePatch | undefined {
  if (!oracleId) return undefined;
  return byOracle.get(oracleId)?.get(lineHash(line));
}
