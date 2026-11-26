/** Feature flag for the CardScript grammar compile path. Default off. On = parser path, with the old compiler as fallback unless fallback is false. */
let enabled = false;

/** Whether compile/classify should run the IR lift/lower path. Default false. */
export function isGrammarEnabled(): boolean {
  return enabled;
}

/** Toggle the grammar path. Tests must restore the previous value (try/finally). */
export function setGrammarEnabled(on: boolean): void {
  enabled = on;
}

/** Options accepted by classify() / compileScry(). */
export interface GrammarOpts {
  /** When true, run the grammar parser (and, by default, fall back to the old compiler if the result is not equivalent). */
  grammar?: boolean;
  /** When grammar is on, use the old compiler if the parser's CardDef is not equivalent. Default true. */
  fallback?: boolean;
}

export function grammarRequested(opts?: GrammarOpts): boolean {
  return opts?.grammar ?? enabled;
}
