/** AI-only games with random decks of compiled real cards, to shake out engine crashes.
 *  npx vite-node scripts/fuzz.ts [bulk.json] [games] [seed] [walkers]
 *  'walkers' mode stuffs every deck with up to 15 supported planeswalkers. */
import fs from 'node:fs';
import { compileScry } from '../src/import/classify';
import { loadPrecons } from '../src/import/precons';
const PRECON = !!process.env.PRECON;
import { registerCards, registerDeck, newGame, startGame, colorIdentity, CARDS } from '../src/engine/engine';
import { tick } from '../src/engine/controller';
import type { CardDef } from '../src/engine/types';

const [path = '/workspace/bulk/slim.json', gamesS = '20', seedS = '1', mode = ''] = process.argv.slice(2);
const WALK = mode === 'walkers'; const SETS = mode === 'sets';
const NEW = new Set<string>(SETS ? (JSON.parse(fs.readFileSync('docs/sets-firstprint.json', 'utf8')) as { cards: string[] }[]).flatMap(v => v.cards) : []);
const all = JSON.parse(fs.readFileSync(path, 'utf8')) as any[];
let seed = +seedS; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const top = all.filter(c => (c.edhrec_rank && c.edhrec_rank < 6000) || (WALK && /Planeswalker/.test(c.type_line ?? '')) || NEW.has(c.name));
const defs: CardDef[] = []; const ok: CardDef[] = [];
for (const c of top) { try { const r = compileScry(c); defs.push(r.def); if (r.support === 'auto' && !r.def.types.includes('Land') || (r.support === 'auto' && !r.def.basic)) ok.push(r.def); } catch (e) { console.log('COMPILE CRASH', c.name, (e as Error).message); } }
registerCards(defs);
const cmdrs = ok.filter(d => d.legendary && d.types.includes('Creature'));
const BASIC: Record<string, string> = { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest' };
const basicIds: Record<string, string> = {};
for (const k of Object.keys(BASIC)) basicIds[k] = Object.values(CARDS).find(d => d.basic && d.mana?.[0].add[0] === k)!.id;
console.log(`pool ${ok.length} supported cards, ${cmdrs.length} commanders`);
let crashes = 0; const turns: number[] = []; let pwActs = 0, pwCast = 0;
for (let gi = 0; gi < +gamesS; gi++) {
  const deckIds: string[] = [];
  for (let p = 0; p < 4; p++) {
    const cmd = cmdrs[Math.floor(rnd() * cmdrs.length)]; const id = colorIdentity(cmd);
    const pool = ok.filter(d => d !== cmd && colorIdentity(d).every(k => id.includes(k)) && !d.legendary);
    const cards: string[] = []; const used = new Set<string>();
    if (SETS) { const nw = ok.filter(d => d !== cmd && NEW.has(d.name) && !d.types.includes('Land') && colorIdentity(d).every(k => id.includes(k))); for (let k = 0; k < 80 && cards.length < 30 && nw.length; k++) { const d = nw[Math.floor(rnd() * nw.length)]; if (!used.has(d.id)) { used.add(d.id); cards.push(d.id); } } }
    if (WALK) { const pws = ok.filter(d => d !== cmd && d.types.includes('Planeswalker') && colorIdentity(d).every(k => id.includes(k))); for (let k = 0; k < 40 && cards.length < 15 && pws.length; k++) { const d = pws[Math.floor(rnd() * pws.length)]; if (!used.has(d.id)) { used.add(d.id); cards.push(d.id); } } }
    while (cards.length < 62 && used.size < pool.length) { const d = pool[Math.floor(rnd() * pool.length)]; if (!used.has(d.id)) { used.add(d.id); cards.push(d.id); } }
    const cols = id.length ? id : ['W'];
    while (cards.length < 99) cards.push(basicIds[cols[cards.length % cols.length]] ?? basicIds.W);
    const dd = { id: `fz-${gi}-${p}`, name: cmd.name, commander: cmd.id, cards }; registerDeck(dd); deckIds.push(dd.id);
  }
  if (PRECON) { const ps = loadPrecons(); deckIds.splice(0, deckIds.length, ...[0, 1, 2, 3].map(k => ps[(gi + k) % ps.length].id)); }
  const g = newGame({ decks: deckIds, humans: [], seed: gi + 1 });
  let steps = 0;
  try {
    startGame(g);
    while (g.winner === null && g.turn < 40 && steps < 30000) { tick(g); steps++; }
    turns.push(g.turn); pwActs += g.log.filter(l => /activates .*: [+\-−0x]/.test(l) && / [+\-−]?[0-9x]+: /i.test(l)).length; pwCast += g.log.filter(l => / casts /.test(l) && Object.values(CARDS).some(d => d.types.includes('Planeswalker') && l.includes(d.name))).length; if (gi < 3) console.log(`game ${gi}: winner ${g.winner} turn ${g.turn} life ${g.players.map(p => p.life).join("/")} bf ${g.players.map(p => p.battlefield.length).join("/")} hand ${g.players.map(p => p.hand.length).join("/")} lib ${g.players.map(p => p.library.length).join("/")}`);
    if (steps >= 30000) console.log(`game ${gi}: STALL at turn ${g.turn} step ${g.step} prio ${g.priority} awaiting ${g.awaiting} decision ${g.decision?.kind} choice ${!!g.choice} res ${!!g.res}\n  ${g.log.slice(-6).join('\n  ')}`);
  } catch (e) { crashes++; console.log(`game ${gi}: CRASH turn ${g.turn}: ${(e as Error).stack?.split('\n').slice(0, 5).join('\n')}\n  last: ${g.log.slice(-4).join('\n  ')}`); }
}
if (WALK) console.log(`walker casts ${pwCast}, loyalty activations ${pwActs}`);
console.log(`${+gamesS} games, ${crashes} crashes, avg turns ${(turns.reduce((a, b) => a + b, 0) / Math.max(1, turns.length)).toFixed(1)}`);
