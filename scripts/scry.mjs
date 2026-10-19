// Shared Scryfall helpers: polite rate limit (~8 req/s), User-Agent, JSON accept.
export const UA = { 'User-Agent': 'CommanderArena/0.2 (github.com/adimego/mtg-commander)', Accept: 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const KW = ['flying', 'trample', 'haste', 'vigilance', 'lifelink', 'deathtouch', 'first strike', 'double strike', 'reach', 'menace', 'defender', 'flash', 'hexproof', 'prowess'];
export async function get(url, opts = {}) { await sleep(120); const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) } }); return r.json(); }
export async function search(q, pages = 4) {
  let url = `https://api.scryfall.com/cards/search?order=edhrec&unique=cards&q=${encodeURIComponent(q)}`; const out = [];
  for (let i = 0; i < pages && url; i++) { const d = await get(url); if (!d.data) break; out.push(...d.data); url = d.has_more ? d.next_page : null; }
  return out;
}
/** Oracle text is empty or only supported keywords, e.g. "Flying, vigilance" / "Flying\nLifelink". */
export function onlyKeywords(c) {
  if (c.card_faces || !c.image_uris) return false;
  const t = (c.oracle_text || '').replace(/\([^)]*\)/g, '').trim(); if (!t) return true;
  return t.split(/\n|,\s*/).every(x => KW.includes(x.trim().toLowerCase()));
}
export const simpleCost = c => !!c.mana_cost && !/[XP\/SC]|\{\d+\/|\{[WUBRG]\/|\{H/.test(c.mana_cost.replace(/\{C\}/g, '')) ;
