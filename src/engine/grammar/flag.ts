/** Feature flag for the CardScript grammar compile path. Default on. On = parser path, with the old compiler as fallback when the parser failed a line the old compiler accepted. */
let enabled = true;

/** Whether compile/classify should run the grammar parser path. Default true. */
export function isGrammarEnabled(): boolean {
  return enabled;
}

/** Toggle the grammar path. Tests must restore the previous value (try/finally). */
export function setGrammarEnabled(on: boolean): void {
  enabled = on;
}

/** Options accepted by classify() / compileScry(). */
export interface GrammarOpts {
  /** When true, run the grammar parser (and, by default, fall back to the old compiler if the parser is worse). */
  grammar?: boolean;
  /** When grammar is on, use the old compiler only if the parser leftover a line the old compiler accepted. Default true. */
  fallback?: boolean;
}

export function grammarRequested(opts?: GrammarOpts): boolean {
  return opts?.grammar ?? enabled;
}
