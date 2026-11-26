/** CardScript IR: schema, validator, lift/lower to today's Effect/TriggerDef/Static, feature flag, golden compare. */
export { CARD_SCRIPT_SCHEMA, CARD_SCRIPT_FACE_KEYS } from './types';
export type {
  CardScript, CardScriptSchemaId, ScriptSource, Span, ParseFailure, CardLayout, Keyword,
  IrEffect, IrTokenSpec, IrCEFx, IrGrant, IrModes, IrTrigger, IrStatic, IrActAbility, IrSpell,
  IrRoomDoor, IrCastRules, IrReplacement, CardScriptFaceKey,
} from './types';
export { EFFECT_KINDS, EFFECT_KIND_SET, STATIC_KINDS, STATIC_KIND_SET, SCRIPT_SOURCES, CARD_LAYOUTS } from './kinds';
export { cardScriptJsonSchema, schemaJson } from './schema';
export { validateCardScript, formatValidationErrors } from './validate';
export type { ValidationError, ValidationResult } from './validate';
export { liftCardDef, liftEffect, liftKeyword } from './lift';
export type { LiftOpts } from './lift';
export { lowerCardScript, lowerEffect, lowerKeyword } from './lower';
export { normalizeValue, sameValue, sameCardDef, diffValue, diffCardDef } from './compare';
export { isGrammarEnabled, setGrammarEnabled, grammarRequested } from './flag';
export type { GrammarOpts } from './flag';

import type { CardDef } from '../types';
import { grammarRequested, type GrammarOpts } from './flag';
import { liftCardDef } from './lift';
import { lowerCardScript } from './lower';
import { validateCardScript } from './validate';
import { sameCardDef } from './compare';

/** Lift → validate → lower. Returns the lowered def only when the roundtrip is lossless; otherwise the original. */
export function grammarRoundtripDef(def: CardDef): { def: CardDef; usedGrammar: boolean } {
  try {
    const ir = liftCardDef(def, { source: 'lift' });
    const v = validateCardScript(ir);
    if (!v.ok) return { def, usedGrammar: false };
    const lowered = lowerCardScript(ir);
    if (!sameCardDef(def, lowered)) return { def, usedGrammar: false };
    return { def: lowered, usedGrammar: true };
  } catch {
    return { def, usedGrammar: false };
  }
}

/** If the grammar flag (or per-call opt) is on, run a lossless lift/lower; otherwise return `cl` unchanged. */
export function maybeApplyGrammar<T extends { def: CardDef }>(cl: T, opts?: GrammarOpts): T {
  if (!grammarRequested(opts)) return cl;
  const { def, usedGrammar } = grammarRoundtripDef(cl.def);
  return usedGrammar ? { ...cl, def } : cl;
}

export { tokenize, splitTokenLines, guessProduction, tokensText } from './tokenize';
export type { Token, TokKind, Production } from './tokenize';
export { parseCard, parseInto } from './parse';
export type { ParseCardResult } from './parse';
export { equivValue, equivCardDef } from './compare';
