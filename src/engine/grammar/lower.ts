/** Lower CardScript IR back to a CardDef the existing exec() / layer() / planPayment() can run. */
import type { ActAbility, CardDef, CEFx, Effect, Modes, RoomDoor, Static, TokenSpec, TriggerDef } from '../types';
import type { CardScript, IrActAbility, IrCastRules, IrCEFx, IrEffect, IrGrant, IrModes, IrRoomDoor, IrSpell, IrStatic, IrTokenSpec, IrTrigger, Keyword } from './types';

export function lowerCardScript(s: CardScript): CardDef {
  const d: CardDef = {
    id: s.id,
    name: s.name,
    types: s.types,
    cost: s.cost,
    colors: s.colors,
    text: s.text ?? '',
  };
  copyIf(d, 'typeLine', s.typeLine);
  copyIf(d, 'identity', s.identity);
  copyIf(d, 'power', s.power);
  copyIf(d, 'toughness', s.toughness);
  copyIf(d, 'legendary', s.legendary);
  copyIf(d, 'basic', s.basic);
  copyIf(d, 'token', s.token);
  copyIf(d, 'loyalty', s.loyalty);
  copyIf(d, 'img', s.img);
  copyIf(d, 'art', s.art);
  copyIf(d, 'sub', s.sub);
  copyIf(d, 'limited', s.limited);
  copyIf(d, 'compiled', s.compiled);
  copyIf(d, 'partner', s.partner);
  copyIf(d, 'canBeCommander', s.canBeCommander);
  copyIf(d, 'mdfc', s.mdfc);
  copyIf(d, 'adventure', s.adventure);
  copyIf(d, 'split', s.split);
  copyIf(d, 'fuse', s.fuse);
  copyIf(d, 'aftermath', s.aftermath);
  copyIf(d, 'flip', s.flip);
  if (s.keywords) d.keywords = s.keywords.map(lowerKeyword);
  if (s.mana) d.mana = s.mana;
  if (s.abilities) d.abilities = s.abilities.map(lowerAct);
  if (s.triggers) d.triggers = s.triggers.map(lowerTrigger);
  if (s.statics) d.statics = s.statics.map(lowerStatic);
  if (s.static) d.static = s.static;
  if (s.spell) d.spell = lowerSpell(s.spell);
  if (s.replacements?.length) d.replacements = s.replacements.map(r => {
    const { kind, span, effects, ...rest } = r as typeof r & { ev?: string };
    return rest as unknown as import('../types').Replacement;
  });
  if (s.faces?.back) d.back = lowerCardScript(s.faces.back);
  if (s.faces?.prepare) d.prepDef = lowerCardScript(s.faces.prepare);
  if (s.room) d.room = { doors: s.room.doors.map(lowerDoor) };
  if (s.castRules) applyCastRules(d, s.castRules);
  return d;
}

function copyIf<K extends keyof CardDef>(d: CardDef, k: K, v: CardDef[K] | undefined): void {
  if (v !== undefined) d[k] = v;
}

export function lowerKeyword(k: Keyword): string {
  return k.type;
}

export function lowerEffect(e: IrEffect): Effect {
  const { kind, id, tag, span: _span, sub, else: els, tok, ce, rt, emb, ...rest } = e;
  void _span;
  const out: Effect = { op: kind, ...rest };
  if (kind === 'script') {
    if (id !== undefined) out.kind = id;
  } else if (tag !== undefined) {
    out.kind = tag;
  }
  if (sub) out.sub = sub.map(lowerEffect);
  if (els) out.else = els.map(lowerEffect);
  if (tok) out.tok = lowerToken(tok);
  if (ce) out.ce = lowerCEFx(ce);
  if (rt) out.rt = { label: rt.label, effects: rt.effects.map(lowerEffect), ...(rt.tslots ? { tslots: rt.tslots } : {}) };
  if (emb) out.emb = lowerCardScript(emb);
  return out;
}

function lowerToken(t: IrTokenSpec): TokenSpec {
  const { ext, ...rest } = t;
  const out: TokenSpec = { ...rest };
  if (ext) {
    const lowered = {} as NonNullable<TokenSpec['ext']>;
    if (ext.text !== undefined) lowered.text = ext.text;
    if (ext.mana) lowered.mana = ext.mana;
    if (ext.keywords) lowered.keywords = ext.keywords.map(lowerKeyword);
    if (ext.abilities) lowered.abilities = ext.abilities.map(lowerAct);
    if (ext.triggers) lowered.triggers = ext.triggers.map(lowerTrigger);
    if (ext.statics) lowered.statics = ext.statics.map(lowerStatic);
    out.ext = lowered;
  }
  return out;
}

function lowerCEFx(c: IrCEFx): CEFx {
  const { grant, ...rest } = c;
  return grant ? { ...rest, grant: lowerGrant(grant) } : { ...rest };
}

function lowerGrant(g: IrGrant): NonNullable<CEFx['grant']> {
  const out: NonNullable<CEFx['grant']> = {};
  if (g.text !== undefined) out.text = g.text;
  if (g.mana) out.mana = g.mana;
  if (g.abilities) out.abilities = g.abilities.map(lowerAct);
  if (g.triggers) out.triggers = g.triggers.map(lowerTrigger);
  if (g.statics) out.statics = g.statics.map(lowerStatic);
  return out;
}

function lowerModes(m: IrModes): Modes {
  const { list, ...rest } = m;
  return { ...rest, list: list.map(x => ({ label: x.label, effects: x.effects.map(lowerEffect), ...(x.tslots ? { tslots: x.tslots } : {}) })) };
}

function lowerSpell(sp: IrSpell): NonNullable<CardDef['spell']> {
  const out: NonNullable<CardDef['spell']> = { effects: sp.effects.map(lowerEffect) };
  if (sp.target !== undefined) out.target = sp.target;
  if (sp.tslots) out.tslots = sp.tslots;
  if (sp.modes) out.modes = lowerModes(sp.modes);
  return out;
}

function lowerAct(a: IrActAbility): ActAbility {
  const { effects, modes, span: _span, ...rest } = a;
  void _span;
  const out: ActAbility = { ...rest, effects: effects.map(lowerEffect) };
  if (modes) out.modes = lowerModes(modes);
  return out;
}

function lowerTrigger(t: IrTrigger): TriggerDef {
  const { effects, modes, span: _span, ...rest } = t;
  void _span;
  const out: TriggerDef = { ...rest, effects: effects.map(lowerEffect) };
  if (modes) out.modes = lowerModes(modes);
  return out;
}

function lowerStatic(st: IrStatic): Static {
  const { kind, grant, span: _span, ...rest } = st;
  void _span;
  const out: Static = { ...rest, k: kind };
  if (grant) out.grant = lowerGrant(grant);
  return out;
}

function lowerDoor(d: IrRoomDoor): RoomDoor {
  const out: RoomDoor = { name: d.name, cost: d.cost };
  if (d.text !== undefined) out.text = d.text;
  if (d.img !== undefined) out.img = d.img;
  if (d.art !== undefined) out.art = d.art;
  if (d.mana) out.mana = d.mana;
  if (d.keywords) out.keywords = d.keywords.map(lowerKeyword);
  if (d.abilities) out.abilities = d.abilities.map(lowerAct);
  if (d.triggers) out.triggers = d.triggers.map(lowerTrigger);
  if (d.statics) out.statics = d.statics.map(lowerStatic);
  return out;
}

function applyCastRules(d: CardDef, rules: IrCastRules): void {
  const { asEnters, overload, offBf, ...rest } = rules;
  Object.assign(d, rest);
  if (asEnters) d.asEnters = asEnters.map(lowerEffect);
  if (overload) d.overload = { cost: overload.cost, ...(overload.spell ? { spell: lowerSpell(overload.spell) } : {}) };
  if (offBf) d.offBf = lowerCEFx(offBf);
}
