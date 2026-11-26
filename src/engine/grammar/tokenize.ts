/** Tokenizer for normalized Oracle text. Run `normalize()` first. */
export type TokKind =
  | 'word'
  | 'number'
  | 'mana'
  | 'self'
  | 'punct'
  | 'keyword'
  | 'counter'
  | 'until'
  | 'abilityWord'
  | 'bullet'
  | 'newline';

export interface Token {
  kind: TokKind;
  text: string;
  start: number;
  end: number;
}

/** Multi-word tokens recognized after normalize() (lowercase). Longer phrases first. */
const PHRASES: [string, TokKind][] = [
  ['until the beginning of your next turn', 'until'],
  ['until your next turn', 'until'],
  ['until end of turn', 'until'],
  ['double strike', 'keyword'],
  ['first strike', 'keyword'],
  ['protection from white', 'keyword'],
  ['protection from blue', 'keyword'],
  ['protection from black', 'keyword'],
  ['protection from red', 'keyword'],
  ['protection from green', 'keyword'],
  ['protection from creatures', 'keyword'],
  ['protection from multicolored', 'keyword'],
  ['converted mana cost', 'keyword'],
  ['mana value', 'keyword'],
];

const PHRASE_MAX = Math.max(...PHRASES.map(([s]) => s.split(' ').length));

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = src.length;
  const push = (kind: TokKind, start: number, end: number) => {
    out.push({ kind, text: src.slice(start, end), start, end });
  };
  while (i < n) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }
    if (ch === '\n') { push('newline', i, i + 1); i++; continue; }
    if (ch === '•' || ch === '·') { push('bullet', i, i + 1); i++; continue; }
    if (ch === '~') { push('self', i, i + 1); i++; continue; }
    if (ch === '{') {
      const j = src.indexOf('}', i + 1);
      if (j < 0) { push('punct', i, i + 1); i++; continue; }
      push('mana', i, j + 1);
      i = j + 1;
      continue;
    }
    // +1/+1, -1/-1, +x/+x, 1+*, *+1, */*, 1/*
    {
      const m = /^(?:[+-]?(?:\d+|x|\*)(?:\/[+-]?(?:\d+|x|\*))|\d+\+\*|1\+\*)/.exec(src.slice(i));
      if (m && /[\/+]/.test(m[0])) { push('counter', i, i + m[0].length); i += m[0].length; continue; }
    }
    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[0-9]/.test(src[j])) j++;
      push('number', i, j);
      i = j;
      continue;
    }
    // em dash / en dash / hyphen as punct (ability-word separator or minus)
    if (ch === '—' || ch === '–') { push('punct', i, i + 1); i++; continue; }
    if ('.,:;!?()/"“”'.includes(ch)) { push('punct', i, i + 1); i++; continue; }
    if (ch === '-') {
      // keep hyphen inside words (non-creature) if flanked by letters; otherwise punct
      const prev = out[out.length - 1];
      const next = src[i + 1];
      if (prev?.kind === 'word' && next && /[a-zA-Z]/.test(next)) {
        // merge into previous word by reading the rest
        let j = i + 1;
        while (j < n && /[a-zA-Z']/.test(src[j])) j++;
        prev.text += src.slice(i, j);
        prev.end = j;
        i = j;
        continue;
      }
      push('punct', i, i + 1);
      i++;
      continue;
    }
    if (/[a-zA-Z']/.test(ch)) {
      let j = i + 1;
      while (j < n && /[a-zA-Z']/.test(src[j])) j++;
      // try phrasal tokens from this word
      const rest = src.slice(i).toLowerCase();
      let hit: [string, TokKind] | null = null;
      for (const [phr, kind] of PHRASES) {
        if (rest === phr || rest.startsWith(phr + ' ') || rest.startsWith(phr + ',') || rest.startsWith(phr + '.') || rest.startsWith(phr + "'") || rest.startsWith(phr + '\n')) {
          hit = [phr, kind];
          break;
        }
      }
      if (hit) {
        push(hit[1], i, i + hit[0].length);
        i += hit[0].length;
        continue;
      }
      push('word', i, j);
      i = j;
      continue;
    }
    // unknown char as punct
    push('punct', i, i + 1);
    i++;
  }
  // merge ability-word prefix: words… punct(—) at start of a line
  return tagAbilityWords(out);
}

function tagAbilityWords(toks: Token[]): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < toks.length) {
    if (toks[i].kind === 'newline') { out.push(toks[i]); i++; continue; }
    // at line start, look for [word(/punct/comma)]+ —   that is not choose/when/whenever/at
    const start = i;
    const first = toks[i];
    if (first.kind === 'word' && !/^(choose|when|whenever|at)$/.test(first.text)) {
      let j = i;
      let dash = -1;
      while (j < toks.length && toks[j].kind !== 'newline') {
        if (toks[j].kind === 'punct' && /[—–]/.test(toks[j].text)) { dash = j; break; }
        if (toks[j].kind !== 'word' && toks[j].kind !== 'punct' && toks[j].kind !== 'keyword') break;
        // commas allowed in ability words ("council's dilemma —")
        j++;
      }
      if (dash >= 0 && dash - start <= 8 && dash > start) {
        out.push({ kind: 'abilityWord', text: toks.slice(start, dash + 1).map(t => t.text).join(' '), start: toks[start].start, end: toks[dash].end });
        i = dash + 1;
        continue;
      }
    }
    out.push(toks[i]);
    i++;
  }
  void PHRASE_MAX;
  return out;
}

export function tokensText(toks: Token[], from = 0, to = toks.length): string {
  let s = '';
  for (let i = from; i < to; i++) {
    const t = toks[i];
    if (t.kind === 'newline') { s += '\n'; continue; }
    if (s && !t.kind.startsWith('punct') && s[s.length - 1] !== '\n' && t.text !== "'s") {
      if (!(t.kind === 'punct' && /[.,:;!?—–)'"]/.test(t.text))) s += ' ';
    }
    s += t.text;
  }
  return s.replace(/ +/g, ' ').replace(/ ([.,:;!?])/g, '$1').trim();
}

/** Split a token stream into lines, joining modal bullets onto the previous line (same as compile()). */
export function splitTokenLines(toks: Token[]): Token[][] {
  const raw: Token[][] = [];
  let cur: Token[] = [];
  const flush = () => { if (cur.length) raw.push(cur); cur = []; };
  for (const t of toks) {
    if (t.kind === 'newline') flush();
    else cur.push(t);
  }
  flush();
  const lines: Token[][] = [];
  for (const l of raw) {
    if (l[0]?.kind === 'bullet' && lines.length) lines[lines.length - 1] = [...lines[lines.length - 1], { kind: 'newline', text: '\n', start: l[0].start, end: l[0].start }, ...l];
    else lines.push(l);
  }
  return lines;
}

export type Production =
  | 'keyword'
  | 'activated'
  | 'triggered'
  | 'static'
  | 'replacement'
  | 'spell'
  | 'modes'
  | 'special'
  | 'line';

/** Classify a line from its leading tokens (RD head). Used for structured failures and dispatch. */
export function guessProduction(toks: Token[]): Production {
  const words = toks.filter(t => t.kind !== 'abilityWord' && t.kind !== 'newline');
  const first = words.find(t => t.kind === 'word' || t.kind === 'self' || t.kind === 'mana' || t.kind === 'keyword')?.text.toLowerCase();
  if (first === 'when' || first === 'whenever' || first === 'at') return 'triggered';
  if (first === 'choose') return 'modes';
  if (first === 'if' && words.some(t => t.text === 'would' || t.text === 'instead')) return 'replacement';
  // cost : body
  const colon = words.findIndex(t => t.kind === 'punct' && t.text === ':');
  if (colon > 0) {
    const head = words.slice(0, colon);
    if (head.some(t => t.kind === 'mana' || /^(sacrifice|discard|pay|exile|tap|untap|remove|put|waterbend)$/.test(t.text))) return 'activated';
  }
  return 'line';
}
