/** Feature flag for the CardScript grammar compile path. Default off (P0: no parser yet). */
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
  /** When true, lift the compiled CardDef to CardScript and lower it back (fallback if not lossless). */
  grammar?: boolean;
}

export function grammarRequested(opts?: GrammarOpts): boolean {
  return opts?.grammar ?? enabled;
}
