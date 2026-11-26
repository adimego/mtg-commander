/** Token cursor for recursive-descent leaves. */
import type { Token, TokKind } from './tokenize';
import { tokensText } from './tokenize';

export class Cursor {
  constructor(public tokens: Token[], public i = 0) {}
  clone(): Cursor { return new Cursor(this.tokens, this.i); }
  atEnd(): boolean {
    return this.i >= this.tokens.length;
  }
  peek(n = 0): Token | undefined { return this.tokens[this.i + n]; }
  peekText(n = 0): string { return this.peek(n)?.text ?? ''; }
  peekKind(n = 0): TokKind | undefined { return this.peek(n)?.kind; }

  eat(...want: string[]): Token | null {
    const t = this.peek();
    if (!t) return null;
    const w = t.text.toLowerCase();
    if (want.some(x => x.toLowerCase() === w)) { this.i++; return t; }
    return null;
  }
  eatKind(...kinds: TokKind[]): Token | null {
    const t = this.peek();
    if (!t || !kinds.includes(t.kind)) return null;
    this.i++;
    return t;
  }
  /** Match a phrase of one or more words/keywords (already lowercase). */
  eatPhrase(...words: string[]): boolean {
    const start = this.i;
    for (const w of words) {
      if (this.peekText().toLowerCase() !== w.toLowerCase()) { this.i = start; return false; }
      this.i++;
    }
    return true;
  }
  remaining(): Token[] { return this.tokens.slice(this.i); }
  remainingText(): string { return tokensText(this.tokens, this.i); }
  commit(other: Cursor): void { this.i = other.i; }
}

export function cursorFrom(toks: Token[]): Cursor {
  return new Cursor(toks);
}
