/** Client-side Scryfall lookup: /cards/collection in batches of 75, with /cards/named?fuzzy= fallback. ~8 req/s. */
export interface ScryFace { name: string; mana_cost?: string; type_line?: string; oracle_text?: string; power?: string; toughness?: string; image_uris?: { normal: string; art_crop: string } }
export interface ScryCard extends ScryFace {
  name: string; layout?: string; cmc?: number; type_line: string; colors?: string[]; color_identity: string[]; keywords: string[];
  legalities?: Record<string, string>; produced_mana?: string[]; card_faces?: ScryFace[];
}
export type FetchLike = (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const API = 'https://api.scryfall.com';

export interface Lookup { found: Map<string, ScryCard>; missing: string[]; fuzzy: Record<string, string> }
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/** Resolve names to Scryfall cards. `found` is keyed by the input name. */
export async function lookupCards(names: string[], opts: { fetch?: FetchLike; delay?: number; onProgress?: (done: number, total: number) => void } = {}): Promise<Lookup> {
  const f: FetchLike = opts.fetch ?? ((u, i) => fetch(u, i)); const delay = opts.delay ?? 125;
  const uniq = [...new Set(names)]; const found = new Map<string, ScryCard>(); const fuzzy: Record<string, string> = {}; const missing: string[] = [];
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  let done = 0; let first = true;
  const wait = async () => { if (!first) await sleep(delay); first = false; };
  const pending: string[] = [];
  for (let i = 0; i < uniq.length; i += 75) {
    const batch = uniq.slice(i, i + 75); await wait();
    const r = await f(`${API}/cards/collection`, { method: 'POST', headers, body: JSON.stringify({ identifiers: batch.map(name => ({ name })) }) });
    if (!r.ok) throw new Error(`Scryfall error ${r.status}`);
    const j = await r.json(); const data: ScryCard[] = j.data ?? [];
    // match results back to the requested names (front face / full name / case-insensitive)
    const byKey = new Map<string, ScryCard>();
    for (const c of data) { byKey.set(norm(c.name), c); byKey.set(norm(c.name.split(' // ')[0]), c); }
    for (const n of batch) { const c = byKey.get(norm(n)) ?? byKey.get(norm(n.split(' // ')[0])); if (c) found.set(n, c); else pending.push(n); }
    done += batch.length; opts.onProgress?.(done - pending.length, uniq.length);
  }
  for (const n of pending) {
    await wait();
    const r = await f(`${API}/cards/named?fuzzy=${encodeURIComponent(n.split(' // ')[0])}`, { headers: { Accept: 'application/json' } });
    if (r.ok) { const c: ScryCard = await r.json(); found.set(n, c); if (norm(c.name) !== norm(n)) fuzzy[n] = c.name; } else missing.push(n);
    opts.onProgress?.(found.size, uniq.length);
  }
  return { found, missing, fuzzy };
}
