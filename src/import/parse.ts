// Decklist parsing: plain text (MTGO, Arena, Moxfield, Archidekt, "1x", set codes, CMDR markers, section headers) and MTGO .dek XML.
export type Section = 'commander' | 'main' | 'side';
export interface Entry { name: string; qty: number; section: Section; set?: string; num?: string }
export interface Parsed { entries: Entry[]; warnings: string[] }

const HEADER = /^(?:\/\/\s*)?(commanders?|command zone|deck|main(?:\s*deck|board)?|sideboard|side|maybeboard|maybe|considering|companions?|tokens?|attractions|stickers)\s*:?\s*(?:\(\d+\))?\s*$/i;
const sectionOf = (h: string): Section | 'skip' => {
  h = h.toLowerCase();
  if (h.startsWith('command')) return 'commander';
  if (/^(deck|main)/.test(h)) return 'main';
  if (/^side/.test(h)) return 'side';
  return 'skip'; // maybeboard, considering, companion, tokens...
};

/** Parse a single card line; returns null if it isn't one. */
export function parseLine(raw: string): { qty: number; name: string; set?: string; num?: string; cmdr: boolean; category?: string } | null {
  let l = raw.trim(); if (!l) return null;
  let cmdr = false, category: string | undefined;
  l = l.replace(/^SB:\s*/i, '');
  // Archidekt categories "[Commander{top}]" / "[Ramp,Removal]"; colour tags "^Have,#37d67a^"
  l = l.replace(/\s*\[([^\]]*)\]/g, (_, c: string) => { category = c; if (/^commander\b/i.test(c.split(/[,{]/)[0].trim())) cmdr = true; return ''; });
  l = l.replace(/\s*\^[^^]*\^/g, '');
  // markers: *CMDR* (Moxfield/Archidekt), *F* foil, *E* etched, *A* alter
  l = l.replace(/\s*\*([A-Za-z]+)\*/g, (_, m: string) => { if (/^cmdr|commander$/i.test(m)) cmdr = true; return ''; });
  const m = /^(\d+)\s*[xX]?\s+(.+)$/.exec(l);
  let qty = 1, rest = l;
  if (m) { qty = +m[1]; rest = m[2]; } else if (/^\d+$/.test(l)) return null;
  let set: string | undefined, num: string | undefined;
  // "(CMR) 123", "(cmr) 123a", "[CMR]" handled above, "(PLST) C21-249"
  const sm = /\s+\(([A-Za-z0-9]{2,6})\)(?:\s+([A-Za-z0-9★-]+))?\s*$/.exec(rest);
  if (sm) { set = sm[1].toLowerCase(); num = sm[2]; rest = rest.slice(0, sm.index); }
  rest = rest.replace(/\s+\/\/?\s+/g, ' // ').replace(/\s+/g, ' ').trim();
  if (!rest || /^(total|cards?)\b/i.test(rest)) return null;
  return { qty, name: rest, set, num, cmdr, category };
}

export function parseDecklist(text: string): Parsed {
  const t = text.replace(/^\uFEFF/, '');
  if (/<\s*Deck\b|<\s*Cards\b/i.test(t)) return parseDek(t);
  const entries: Entry[] = []; const warnings: string[] = [];
  let section: Section | 'skip' = 'main'; let sawHeader = false; const blocks: Entry[][] = [[]];
  for (const raw of t.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { if (blocks[blocks.length - 1].length) blocks.push([]); continue; }
    if (line.startsWith('#') || (line.startsWith('//') && !HEADER.test(line))) continue;
    const h = HEADER.exec(line); if (h) { section = sectionOf(h[1]); sawHeader = true; continue; }
    if (/^about$|^name\s/i.test(line)) continue; // Arena "About / Name X"
    const p = parseLine(line); if (!p) { warnings.push(`Couldn't read line: "${line}"`); continue; }
    if (section === 'skip') continue;
    const e: Entry = { name: p.name, qty: p.qty, section: p.cmdr ? 'commander' : (/^sideboard|^maybe/i.test(p.category ?? '') ? 'side' : section), set: p.set, num: p.num };
    if (p.category && /^maybe/i.test(p.category)) continue;
    entries.push(e); blocks[blocks.length - 1].push(e);
  }
  // Moxfield/MTGO plain exports without headers put the commander(s) in a short trailing block after a blank line.
  const nonEmpty = blocks.filter(b => b.length);
  if (!sawHeader && !entries.some(e => e.section === 'commander') && nonEmpty.length >= 2) {
    const last = nonEmpty[nonEmpty.length - 1];
    if (last.length <= 2 && last.every(e => e.qty === 1)) for (const e of last) e.section = 'commander';
  }
  // MTGO-style: sideboard with 1–2 singletons and no commander section = commander(s)
  const side = entries.filter(e => e.section === 'side');
  if (!entries.some(e => e.section === 'commander') && side.length >= 1 && side.length <= 2 && side.every(e => e.qty === 1)) for (const e of side) e.section = 'commander';
  return { entries: entries.filter(e => e.section !== 'side'), warnings };
}

function parseDek(xml: string): Parsed {
  const entries: Entry[] = []; const warnings: string[] = [];
  for (const m of xml.matchAll(/<Cards\b([^>]*)\/?>/gi)) {
    const a = (k: string) => new RegExp(`${k}\\s*=\\s*"([^"]*)"`, 'i').exec(m[1])?.[1];
    const name = a('Name'); if (!name) { warnings.push('Card without a name in .dek'); continue; }
    const dec = name.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    entries.push({ name: dec, qty: +(a('Quantity') ?? 1), section: a('Sideboard') === 'true' ? 'commander' : 'main' });
  }
  const cmd = entries.filter(e => e.section === 'commander');
  if (cmd.length > 2) { for (const e of cmd) e.section = 'side'; warnings.push('The .dek sideboard has more than 2 cards, so it was ignored. Pick the commander below.'); }
  return { entries: entries.filter(e => e.section !== 'side'), warnings };
}
