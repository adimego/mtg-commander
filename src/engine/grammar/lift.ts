/** Lift a compiled / hand-written CardDef into CardScript IR (mechanical, lossless). */
import type { ActAbility, CardDef, CEFx, Effect, Modes, RoomDoor, Static, TokenSpec, TriggerDef } from '../types';
import { CARD_SCRIPT_FACE_KEYS, CARD_SCRIPT_SCHEMA, type CardLayout, type CardScript, type IrActAbility, type IrCastRules, type IrCEFx, type IrEffect, type IrGrant, type IrModes, type IrRoomDoor, type IrSpell, type IrStatic, type IrTokenSpec, type IrTrigger, type Keyword, type ScriptSource } from './types';

const FACE = new Set<string>(CARD_SCRIPT_FACE_KEYS);

export interface LiftOpts {
  source?: ScriptSource;
  oracleId?: string;
  oracleTextHash?: string;
}

export function liftCardDef(d: CardDef, opts: LiftOpts = {}): CardScript {
  const s: CardScript = {
    schema: CARD_SCRIPT_SCHEMA,
    source: opts.source ?? 'lift',
    id: d.id,
    name: d.name,
    types: d.types,
    cost: d.cost,
    colors: d.colors,
  };
  if (opts.oracleId) s.oracleId = opts.oracleId;
  if (opts.oracleTextHash) s.oracleTextHash = opts.oracleTextHash;
  const layout = inferLayout(d);
  if (layout !== 'normal') s.layout = layout;
  copyIf(s, 'typeLine', d.typeLine);
  copyIf(s, 'text', d.text);
  copyIf(s, 'identity', d.identity);
  copyIf(s, 'power', d.power);
  copyIf(s, 'toughness', d.toughness);
  copyIf(s, 'legendary', d.legendary);
  copyIf(s, 'basic', d.basic);
  copyIf(s, 'token', d.token);
  copyIf(s, 'loyalty', d.loyalty);
  copyIf(s, 'img', d.img);
  copyIf(s, 'art', d.art);
  copyIf(s, 'sub', d.sub);
  copyIf(s, 'limited', d.limited);
  copyIf(s, 'compiled', d.compiled);
  copyIf(s, 'partner', d.partner);
  copyIf(s, 'canBeCommander', d.canBeCommander);
  copyIf(s, 'mdfc', d.mdfc);
  copyIf(s, 'adventure', d.adventure);
  copyIf(s, 'split', d.split);
  copyIf(s, 'fuse', d.fuse);
  copyIf(s, 'aftermath', d.aftermath);
  copyIf(s, 'flip', d.flip);
  if (d.keywords) s.keywords = d.keywords.map(liftKeyword);
  if (d.mana) s.mana = d.mana;
  if (d.abilities) s.abilities = d.abilities.map(liftAct);
  if (d.triggers) s.triggers = d.triggers.map(liftTrigger);
  if (d.statics) s.statics = d.statics.map(liftStatic);
  if (d.static) s.static = d.static;
  if (d.spell) s.spell = liftSpell(d.spell);
  if (d.back || d.prepDef) {
    s.faces = {};
    if (d.back) s.faces.back = liftCardDef(d.back, { source: s.source });
    if (d.prepDef) s.faces.prepare = liftCardDef(d.prepDef, { source: s.source });
  }
  if (d.room) s.room = { doors: d.room.doors.map(liftDoor) };
  const cast = liftCastRules(d);
  if (cast && Object.keys(cast).length) s.castRules = cast;
  return s;
}

function inferLayout(d: CardDef): CardLayout {
  if (d.room) return 'room';
  if (d.prepDef) return 'prepare';
  if (d.adventure) return 'adventure';
  if (d.mdfc) return 'modal_dfc';
  if (d.split) return 'split';
  if (d.flip) return 'flip';
  if (d.back) return 'transform';
  return 'normal';
}

function copyIf<K extends keyof CardScript>(s: CardScript, k: K, v: CardScript[K] | undefined): void {
  if (v !== undefined) s[k] = v;
}

export function liftKeyword(type: string): Keyword {
  return { type };
}

export function liftEffect(e: Effect): IrEffect {
  const { op, kind, sub, else: els, tok, ce, rt, emb, ...rest } = e;
  const ir: IrEffect = { kind: op, ...rest };
  if (op === 'script') {
    if (kind !== undefined) ir.id = kind;
  } else if (kind !== undefined) {
    ir.tag = kind;
  }
  if (sub) ir.sub = sub.map(liftEffect);
  if (els) ir.else = els.map(liftEffect);
  if (tok) ir.tok = liftToken(tok);
  if (ce) ir.ce = liftCEFx(ce);
  if (rt) ir.rt = { label: rt.label, effects: rt.effects.map(liftEffect), ...(rt.tslots ? { tslots: rt.tslots } : {}) };
  if (emb) ir.emb = liftCardDef(emb, { source: 'lift' });
  return ir;
}

function liftToken(t: TokenSpec): IrTokenSpec {
  const { ext, ...rest } = t;
  const ir: IrTokenSpec = { ...rest };
  if (ext) {
    const lifted: NonNullable<IrTokenSpec['ext']> = {};
    if (ext.text !== undefined) lifted.text = ext.text;
    if (ext.mana) lifted.mana = ext.mana;
    if (ext.keywords) lifted.keywords = ext.keywords.map(liftKeyword);
    if (ext.abilities) lifted.abilities = ext.abilities.map(liftAct);
    if (ext.triggers) lifted.triggers = ext.triggers.map(liftTrigger);
    if (ext.statics) lifted.statics = ext.statics.map(liftStatic);
    ir.ext = lifted;
  }
  return ir;
}

function liftCEFx(c: CEFx): IrCEFx {
  const { grant, ...rest } = c;
  return grant ? { ...rest, grant: liftGrant(grant) } : { ...rest };
}

function liftGrant(g: NonNullable<CEFx['grant']>): IrGrant {
  const out: IrGrant = {};
  if (g.text !== undefined) out.text = g.text;
  if (g.mana) out.mana = g.mana;
  if (g.abilities) out.abilities = g.abilities.map(liftAct);
  if (g.triggers) out.triggers = g.triggers.map(liftTrigger);
  if (g.statics) out.statics = g.statics.map(liftStatic);
  return out;
}

function liftModes(m: Modes): IrModes {
  const { list, ...rest } = m;
  return { ...rest, list: list.map(x => ({ label: x.label, effects: x.effects.map(liftEffect), ...(x.tslots ? { tslots: x.tslots } : {}) })) };
}

function liftSpell(sp: NonNullable<CardDef['spell']>): IrSpell {
  const out: IrSpell = { effects: sp.effects.map(liftEffect) };
  if (sp.target !== undefined) out.target = sp.target;
  if (sp.tslots) out.tslots = sp.tslots;
  if (sp.modes) out.modes = liftModes(sp.modes);
  return out;
}

function liftAct(a: ActAbility): IrActAbility {
  const { effects, modes, ...rest } = a;
  const out: IrActAbility = { ...rest, effects: effects.map(liftEffect) };
  if (modes) out.modes = liftModes(modes);
  return out;
}

function liftTrigger(t: TriggerDef): IrTrigger {
  const { effects, modes, ...rest } = t;
  const out: IrTrigger = { ...rest, effects: effects.map(liftEffect) };
  if (modes) out.modes = liftModes(modes);
  return out;
}

function liftStatic(st: Static): IrStatic {
  const { k, grant, ...rest } = st;
  const out: IrStatic = { ...rest, kind: k };
  if (grant) out.grant = liftGrant(grant);
  return out;
}

function liftDoor(d: RoomDoor): IrRoomDoor {
  const out: IrRoomDoor = { name: d.name, cost: d.cost };
  if (d.text !== undefined) out.text = d.text;
  if (d.img !== undefined) out.img = d.img;
  if (d.art !== undefined) out.art = d.art;
  if (d.mana) out.mana = d.mana;
  if (d.keywords) out.keywords = d.keywords.map(liftKeyword);
  if (d.abilities) out.abilities = d.abilities.map(liftAct);
  if (d.triggers) out.triggers = d.triggers.map(liftTrigger);
  if (d.statics) out.statics = d.statics.map(liftStatic);
  return out;
}

function liftCastRules(d: CardDef): IrCastRules | undefined {
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (FACE.has(k) || v === undefined) continue;
    raw[k] = v;
  }
  if (!Object.keys(raw).length) return undefined;
  const rules = raw as IrCastRules;
  if (d.asEnters) rules.asEnters = d.asEnters.map(liftEffect);
  if (d.overload) rules.overload = { cost: d.overload.cost, ...(d.overload.spell ? { spell: liftSpell(d.overload.spell) } : {}) };
  if (d.offBf) rules.offBf = liftCEFx(d.offBf);
  return rules;
}
