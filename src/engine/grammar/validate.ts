/** Structural validator for CardScript v1. TypeScript types are canonical; this checks JSON at runtime. */
import { CARD_SCRIPT_SCHEMA, type CardScript, type ScriptSource } from './types';
import { CARD_LAYOUTS, COLORS, EFFECT_KIND_SET, SCRIPT_SOURCES, STATIC_KIND_SET } from './kinds';

export interface ValidationError { path: string; message: string }
export type ValidationResult = { ok: true; script: CardScript } | { ok: false; errors: ValidationError[] }

const COLOR_SET = new Set<string>(COLORS);
const SOURCE_SET = new Set<string>(SCRIPT_SOURCES);
const LAYOUT_SET = new Set<string>(CARD_LAYOUTS);

export function validateCardScript(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  visitScript(input, '$', errors, true);
  if (errors.length) return { ok: false, errors };
  return { ok: true, script: input as CardScript };
}

export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map(e => `${e.path}: ${e.message}`).join('\n');
}

function err(errors: ValidationError[], path: string, message: string): void {
  errors.push({ path, message });
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function visitScript(v: unknown, path: string, errors: ValidationError[], requireSchema: boolean): void {
  if (!isObj(v)) { err(errors, path, 'expected a CardScript object'); return; }
  if (requireSchema) {
    if (v.schema !== CARD_SCRIPT_SCHEMA) err(errors, `${path}.schema`, `expected ${CARD_SCRIPT_SCHEMA}`);
  } else if (v.schema !== undefined && v.schema !== CARD_SCRIPT_SCHEMA) {
    err(errors, `${path}.schema`, `expected ${CARD_SCRIPT_SCHEMA}`);
  }
  if (v.source === undefined) err(errors, `${path}.source`, 'required');
  else if (!SOURCE_SET.has(v.source as ScriptSource)) err(errors, `${path}.source`, `unknown source ${JSON.stringify(v.source)}`);
  if (typeof v.id !== 'string' || !v.id) err(errors, `${path}.id`, 'required non-empty string');
  if (typeof v.name !== 'string' || !v.name) err(errors, `${path}.name`, 'required non-empty string');
  if (!Array.isArray(v.types) || !v.types.every(t => typeof t === 'string')) err(errors, `${path}.types`, 'required string[]');
  if (!isObj(v.cost) || typeof v.cost.generic !== 'number') err(errors, `${path}.cost`, 'required Cost with numeric generic');
  if (!Array.isArray(v.colors) || !v.colors.every(c => COLOR_SET.has(c as string))) err(errors, `${path}.colors`, 'required Color[]');
  if (v.layout !== undefined && !LAYOUT_SET.has(v.layout as string)) err(errors, `${path}.layout`, `unknown layout ${JSON.stringify(v.layout)}`);
  if (v.keywords !== undefined) visitKeywords(v.keywords, `${path}.keywords`, errors);
  if (v.abilities !== undefined) visitArray(v.abilities, `${path}.abilities`, errors, visitAct);
  if (v.triggers !== undefined) visitArray(v.triggers, `${path}.triggers`, errors, visitTrigger);
  if (v.statics !== undefined) visitArray(v.statics, `${path}.statics`, errors, visitStatic);
  if (v.spell !== undefined) visitSpell(v.spell, `${path}.spell`, errors);
  if (v.replacements !== undefined) visitArray(v.replacements, `${path}.replacements`, errors, (r, p, e) => {
    if (!isObj(r)) { err(e, p, 'expected a replacement'); return; }
    if (typeof r.kind !== 'string' || !r.kind) err(e, `${p}.kind`, 'required non-empty string');
    if (r.effects !== undefined) visitEffects(r.effects, `${p}.effects`, e);
  });
  if (v.faces !== undefined) {
    if (!isObj(v.faces)) err(errors, `${path}.faces`, 'expected an object');
    else {
      if (v.faces.back !== undefined) visitScript(v.faces.back, `${path}.faces.back`, errors, false);
      if (v.faces.prepare !== undefined) visitScript(v.faces.prepare, `${path}.faces.prepare`, errors, false);
    }
  }
  if (v.room !== undefined) {
    if (!isObj(v.room) || !Array.isArray(v.room.doors)) err(errors, `${path}.room`, 'expected { doors: RoomDoor[] }');
    else visitArray(v.room.doors, `${path}.room.doors`, errors, visitDoor);
  }
  if (v.castRules !== undefined) visitCastRules(v.castRules, `${path}.castRules`, errors);
  if (v.failures !== undefined) visitArray(v.failures, `${path}.failures`, errors, visitFailure);
}

function visitKeywords(v: unknown, path: string, errors: ValidationError[]): void {
  visitArray(v, path, errors, (k, p, e) => {
    if (!isObj(k) || typeof k.type !== 'string' || !k.type) err(e, p, 'expected { type: string }');
  });
}

function visitArray(v: unknown, path: string, errors: ValidationError[], each: (x: unknown, p: string, e: ValidationError[]) => void): void {
  if (!Array.isArray(v)) { err(errors, path, 'expected an array'); return; }
  v.forEach((x, i) => each(x, `${path}[${i}]`, errors));
}

function visitEffects(v: unknown, path: string, errors: ValidationError[]): void {
  visitArray(v, path, errors, visitEffect);
}

function visitEffect(v: unknown, path: string, errors: ValidationError[]): void {
  if (!isObj(v)) { err(errors, path, 'expected an effect'); return; }
  if (typeof v.kind !== 'string' || !v.kind) { err(errors, `${path}.kind`, 'required non-empty string'); return; }
  if (!EFFECT_KIND_SET.has(v.kind)) err(errors, `${path}.kind`, `unknown kind ${JSON.stringify(v.kind)}`);
  if (v.kind === 'script' && (typeof v.id !== 'string' || !v.id)) err(errors, `${path}.id`, 'script effects require a non-empty hook id');
  if (v.sub !== undefined) visitEffects(v.sub, `${path}.sub`, errors);
  if (v.else !== undefined) visitEffects(v.else, `${path}.else`, errors);
  if (v.tok !== undefined && isObj(v.tok) && v.tok.ext !== undefined && isObj(v.tok.ext)) {
    const ext = v.tok.ext;
    if (ext.keywords !== undefined) visitKeywords(ext.keywords, `${path}.tok.ext.keywords`, errors);
    if (ext.abilities !== undefined) visitArray(ext.abilities, `${path}.tok.ext.abilities`, errors, visitAct);
    if (ext.triggers !== undefined) visitArray(ext.triggers, `${path}.tok.ext.triggers`, errors, visitTrigger);
    if (ext.statics !== undefined) visitArray(ext.statics, `${path}.tok.ext.statics`, errors, visitStatic);
  }
  if (v.ce !== undefined) visitCEFx(v.ce, `${path}.ce`, errors);
  if (v.rt !== undefined) {
    if (!isObj(v.rt) || typeof v.rt.label !== 'string') err(errors, `${path}.rt`, 'expected { label, effects }');
    else visitEffects(v.rt.effects, `${path}.rt.effects`, errors);
  }
  if (v.emb !== undefined) visitScript(v.emb, `${path}.emb`, errors, false);
}

function visitCEFx(v: unknown, path: string, errors: ValidationError[]): void {
  if (!isObj(v)) { err(errors, path, 'expected a continuous effect'); return; }
  if (v.grant !== undefined) visitGrant(v.grant, `${path}.grant`, errors);
}

function visitGrant(v: unknown, path: string, errors: ValidationError[]): void {
  if (!isObj(v)) { err(errors, path, 'expected a grant'); return; }
  if (v.abilities !== undefined) visitArray(v.abilities, `${path}.abilities`, errors, visitAct);
  if (v.triggers !== undefined) visitArray(v.triggers, `${path}.triggers`, errors, visitTrigger);
  if (v.statics !== undefined) visitArray(v.statics, `${path}.statics`, errors, visitStatic);
}

function visitModes(v: unknown, path: string, errors: ValidationError[]): void {
  if (!isObj(v) || typeof v.min !== 'number' || typeof v.max !== 'number' || !Array.isArray(v.list)) {
    err(errors, path, 'expected Modes { min, max, list }');
    return;
  }
  visitArray(v.list, `${path}.list`, errors, (x, p, e) => {
    if (!isObj(x) || typeof x.label !== 'string') err(e, p, 'expected { label, effects }');
    else visitEffects(x.effects, `${p}.effects`, e);
  });
}

function visitSpell(v: unknown, path: string, errors: ValidationError[]): void {
  if (!isObj(v)) { err(errors, path, 'expected a spell'); return; }
  visitEffects(v.effects, `${path}.effects`, errors);
  if (v.modes !== undefined) visitModes(v.modes, `${path}.modes`, errors);
}

function visitAct(v: unknown, path: string, errors: ValidationError[]): void {
  if (!isObj(v)) { err(errors, path, 'expected an activated ability'); return; }
  if (typeof v.label !== 'string') err(errors, `${path}.label`, 'required string');
  visitEffects(v.effects, `${path}.effects`, errors);
  if (v.modes !== undefined) visitModes(v.modes, `${path}.modes`, errors);
}

function visitTrigger(v: unknown, path: string, errors: ValidationError[]): void {
  if (!isObj(v)) { err(errors, path, 'expected a trigger'); return; }
  if (typeof v.on !== 'string' || !v.on) err(errors, `${path}.on`, 'required string');
  if (typeof v.label !== 'string') err(errors, `${path}.label`, 'required string');
  visitEffects(v.effects, `${path}.effects`, errors);
  if (v.modes !== undefined) visitModes(v.modes, `${path}.modes`, errors);
}

function visitStatic(v: unknown, path: string, errors: ValidationError[]): void {
  if (!isObj(v)) { err(errors, path, 'expected a static'); return; }
  if (typeof v.kind !== 'string' || !v.kind) err(errors, `${path}.kind`, 'required non-empty string');
  else if (!STATIC_KIND_SET.has(v.kind)) err(errors, `${path}.kind`, `unknown kind ${JSON.stringify(v.kind)}`);
  if (v.who !== undefined && !['self', 'attached', 'others', 'all'].includes(v.who as string)) {
    err(errors, `${path}.who`, `unknown who ${JSON.stringify(v.who)}`);
  }
  if (v.grant !== undefined) visitGrant(v.grant, `${path}.grant`, errors);
}

function visitDoor(v: unknown, path: string, errors: ValidationError[]): void {
  if (!isObj(v)) { err(errors, path, 'expected a room door'); return; }
  if (typeof v.name !== 'string') err(errors, `${path}.name`, 'required string');
  if (!isObj(v.cost) || typeof v.cost.generic !== 'number') err(errors, `${path}.cost`, 'required Cost');
  if (v.keywords !== undefined) visitKeywords(v.keywords, `${path}.keywords`, errors);
  if (v.abilities !== undefined) visitArray(v.abilities, `${path}.abilities`, errors, visitAct);
  if (v.triggers !== undefined) visitArray(v.triggers, `${path}.triggers`, errors, visitTrigger);
  if (v.statics !== undefined) visitArray(v.statics, `${path}.statics`, errors, visitStatic);
}

function visitCastRules(v: unknown, path: string, errors: ValidationError[]): void {
  if (!isObj(v)) { err(errors, path, 'expected an object'); return; }
  if (v.asEnters !== undefined) visitEffects(v.asEnters, `${path}.asEnters`, errors);
  if (v.overload !== undefined) {
    if (!isObj(v.overload) || !isObj(v.overload.cost)) err(errors, `${path}.overload`, 'expected { cost, spell? }');
    else if (v.overload.spell !== undefined) visitSpell(v.overload.spell, `${path}.overload.spell`, errors);
  }
  if (v.offBf !== undefined) visitCEFx(v.offBf, `${path}.offBf`, errors);
}

function visitFailure(v: unknown, path: string, errors: ValidationError[]): void {
  if (!isObj(v) || typeof v.text !== 'string' || typeof v.reason !== 'string') {
    err(errors, path, 'expected { text, reason }');
  }
}
