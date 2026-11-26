# Deferred leftovers

Living list of Oracle wording and mechanics that are **not** modelled yet, or were only modelled in a simple form and still leave cards Limited. Counts are from the same Scryfall Oracle Cards bulk and `classify()` method used for support reports (unique `oracle_id`, commander-legal, excluding tokens, emblems, dungeons, planes, phenomena, schemes, vanguards, conspiracies, and commander-banned cards). Corpus size: **32,643**.

**Last updated:** 2026-11-26, after the popular-card Batch 1 PR (top 250). Support is **17,846 / 32,643 (54.7%)** — auto 17,685, builtin 161, Limited 14,797. After the day/night and shared-piece sweep PR [#39](https://github.com/adimego/mtg-commander/pull/39) it was 17,783 / 32,643 (54.5%). After the second P4 PR [#38](https://github.com/adimego/mtg-commander/pull/38) it was 17,665 / 32,643 (54.1%); after the first P4 replacements PR [#37](https://github.com/adimego/mtg-commander/pull/37) it was 17,566 / 32,643 (53.8%); after the second P3 PR [#36](https://github.com/adimego/mtg-commander/pull/36) it was 17,516 / 32,643 (53.7%); after the first P3 PR [#35](https://github.com/adimego/mtg-commander/pull/35) it was 17,389 / 32,643 (53.3%); after P2 [#34](https://github.com/adimego/mtg-commander/pull/34) it was 17,260 / 32,643 (52.9%).

**How to read a row.** *Involved* is how many current Limited cards have at least one leftover line in the family. *Exclusive* is how many of those cards have every leftover line in that family, so modelling the family *could* flip the card if the inner effect is also exact. Families overlap; do not add rows. Plan-era figures are labelled when a current recount was not the source.

This is the in-repo copy. Keep `/workspace/mtg-commander-plan-notes/deferred.md` in sync when a PR lands.

---

## 1. Keywords plan A–K leftovers

Phases A–K shipped a large set of ability-word conditions, combat keywords, alt-cost / from-zone keywords, storm/split second, two-commander pairing flags, clock counters, energy, split/fuse/aftermath/flip layout, and some variable P/T CDAs. What remains is almost never the original keyword itself. It is a rider, an unusual cost, a replacement, or a system that was parked or moved to a later phase.

| Wording / mechanic | Approx. cards (current unless noted) | Why it was deferred | Waits on |
|---|---:|---|---|
| Ability-word *riders* still unparsed (Landfall “if that land is a Mountain”, unique Delirium/Domain/Threshold tails, Channel variants, etc.) | Plan A estimated a few dozen unique tails after the core conds shipped; leftovers now sit inside P3 `if` / grant / for-each frames rather than as missing words | The prefix already strips; the leftover is a condition or effect the compiler still rejects | P3 compose frames (conditions, grants, amounts); unique tails may stay Limited |
| Enter as a copy / become a copy — leftovers | 98 exclusive / 116 involved (down from 118 / 137) | The CR 707 hook shipped (see Done in P4). Leftovers are quoted-ability or mixed excepts, shield/vanishing riders, odd filters, and mid-turn “become a copy of that creature” | Further except wording, or stay Limited |
| Copy a spell or ability (unusual stack-copy leftovers) | 107 exclusive / 145 involved (current leftover scan; simple Twincast / “next instant or sorcery this turn” copies now parse) | Leftovers are commander-storm copies, ability copies, modal / “with mana value X”, and unique riders | Unique tails, or stay Limited |
| Extra turns — leftovers | 17 exclusive / 26 involved | “You take an extra turn”, “target player takes an extra turn”, and Final Fortune’s “at the beginning of that turn’s end step, you lose the game” now parse. Leftovers are coin flips, gifts, extra-turn *if* riders, and unique costs | Unique tails, or stay Limited |
| Votes / Will of the council / Council’s dilemma / Tempting offer | Plan K: ~24+ exclusive | Multi-player vote UI and AI | A later vote system (not P3) |
| Monarch *leftover effects* (the monarch itself already exists) | A few dozen leftover lines mention the monarch; core “you’re the monarch” conds already parse | Court-cycle and unique monarch riders | P3 if the rider is a known verb; otherwise unique tails |
| Role tokens | Plan K: 28 exclusive | Token subtypes with attached auras and a special sheet | A later role-token hook |
| Learn / Lessons | Plan K: 17 exclusive | Needs a lesson pile or a simplified search-from-sideboard policy | Product decision + search hook |
| Collect evidence / suspected / case “solved” leftovers | Small; cases are partly flagged | Evidence counts and suspected status aren’t general | A later set-mechanic pass |
| Amass / Investigate / Proliferate / Explore / Connive / Discover *riders* | Keyword actions often parse; leftover is a following sentence | Fail-closed on the rider, not the keyword | P3 multi-sentence chaining when the rider is a known verb |
| Haunt, Forecast, Escalate leftovers, Max-speed leftovers, Gift leftovers, and similar half-done keywords | Typically ≤11 exclusive each in the original catalog | Unusual activation windows or leftover templates after the simple form shipped | Opportunistic keyword cleanup, not a P3 frame |
| Daybound / nightbound / “it becomes day/night” — leftovers | 5 exclusive / 5 involved (down from 36 / 79) | CR 732 / 702.145 day/night, daybound/nightbound transforms, The Celestus, and old Innistrad “no / two or more spells last turn” werewolves now parse. Leftovers are unique tails (Tovolar, look-at-top dayNight triggers, “it becomes night” plus another unique verb) | Unique tails, or stay Limited |
| Phasing / phases in / phases out — leftovers | 25 exclusive / 35 involved (down from 42 / 55) | The *phasing* keyword, “~ / target X / all [filter] phase(s) out”, and “whenever ~ phases in” now parse. Leftovers are unique riders (“can't phase in”, modal, until-leaves, Spectral Adversary) | Unique tails, or stay Limited |

---

## 2. Blockers Batch 1 / 2 leftovers

Batch 1 shipped Tribute plus the cheap repeated keywords. Batch 2 shipped Energy, split/fuse/aftermath, flip faces, and common variable-P/T CDAs. These are the leftovers that were called out as not exact enough (or not in scope) at the time.

| Wording / mechanic | Approx. cards | Why it was deferred | Waits on |
|---|---:|---|---|
| Energy *alt costs* and unusual get/pay phrasing (pay `{E}` as an additional or alternative cost, “you may pay `{E}` rather than…”, activations that aren’t the simple `{E}` cost) | 61 exclusive / 68 involved among remaining energy leftover lines | Batch 2 modelled the `{E}` pool, “you get `{E}`”, paying `{E}` in ordinary costs, and “energy counters you have” amounts. Alt-cost wording and mixed additional costs were fail-closed | P3 additional / alt costs, then any energy-specific cost hook still needed |
| Split halves that still don’t compile (one half’s effect is unmodelled, or a structural leftover after fuse/aftermath) | Layout support shipped for both faces, fuse, and aftermath; remaining Limited split cards fail on an effect inside a half, not on being split | The leftover is a verb or frame inside the half | P3 if that frame/verb is composed; otherwise the unique effect |
| Flip *conditions* (when to flip, “~ is flipped”, flipped-face CDAs/statics) | Flip *faces* compile when the back is a normal face; leftover is the flip condition or a flipped-only static | Needs a reliable flipped-state cond and, for some cards, a CDA that only applies while flipped | P3 conds if the condition is exact and cheap; otherwise P4 |
| Odd CDAs (power/toughness equal to an amount `amount()` still rejects, or a CDA that isn’t “P/T are each equal to [count]” / “toughness is that number plus N”) | 37 exclusive / 79 involved among remaining CDA leftover lines | Batch 2 covered the common count-based shapes and hooked them to the existing `statics` P/T path. Unusual amounts and hybrid CDAs were fail-closed | P3 for-each / where-X amounts when the amount is exact; unique CDAs stay Limited |
| Odd ward costs (ward that isn’t `39`, “pay N life”, or blight) | 15 exclusive / 32 involved | Simple ward shipped; leftover costs (discard, exile, sacrifice, typal, etc.) were out of Batch 1’s “unusual leftover ward” cut | A small ward-cost parser, or P3 additional-cost pieces if they compose exactly |
| Partner-with ETB / search cleanup (“when ~ enters, you may search for [partner], reveal it, put it into your hand…”) | 13 exclusive / 28 involved (plan-era 17 / 47) | Pairing itself shipped so two commanders can be chosen. The ETB/search reminder was optional in Batch 1 and later parked in the grammar plan | A dedicated Partner-with ETB script/parser; not a P3 frame |

---

## 3. P2 leftovers (simple leftover verbs / trigger heads)

P2 only wires a trigger head when the engine already emits that event (or a new emit is a local, exact hook). Verb bodies must match official rules. These were measured after PR #34.

| Wording / mechanic | Approx. cards | Why it was deferred | Waits on |
|---|---:|---|---|
| Venture into the dungeon / complete a dungeon | 28 exclusive / 40 involved (20 leftover lines are exactly “venture into the dungeon”) | No dungeon state machine. A simplified venture counter was allowed only if it matched existing dungeon support; there is none | A dungeon / venture system (Batch 3 / P4-adjacent) |
| Take the initiative / the initiative | 15 exclusive / 26 involved (20 leftover lines are “you take the initiative”) | Same underworld-dungeon complex; parked with venture | Initiative + dungeon system |
| End-of-combat triggers — leftovers | 47 exclusive / 59 involved (down from 89 / 107) | The `endCombat` step shipped (see Done in P4). `blockedBy` / attacking / blocking stay set until the step is left. Leftovers are unusual bodies or “activate only during the end of combat step” | Unique EOC bodies, or stay Limited |
| “~ deals combat damage to a creature” — leftovers | 14 exclusive / 18 involved (down from 29 / 39) | A per-recipient `combatDamageCreature` event now carries the damaged creature as `evCard`. Leftovers are unusual tails, not the missing emit | Unique tails, or stay Limited |
| Remaining unblocked / blocks variants that are not the shipped heads | “~ attacks and isn’t blocked” still 21 leftover heads — usually because the *body* (often “destroy that creature at end of combat”) failed, not the head itself | Fail-closed on the body or on a compound head | End-of-combat hook, or a remaining exact body |
| “~ is turned face up” still appearing as a leftover head (~28) | The head and `morphTurn` emit shipped in #34; leftover cards have an unmodelled body (or disguise/megamorph rider) | Fail-closed on the body | P3 if the body is a known verb; unique effects stay Limited |
| “~ mutates” (31 leftover heads) | See parked Mutate | Mutate | Mutate system (parked) |
| Other remaining P2-style heads/verbs (you cycle ~, you attack, equipped creature attacks, “~ enters or attacks” already exists in some forms, unique tokens, “roll a d20”, experience counters, mutagen, ravenous, living metal, spree, “a deck can have any number…”, skip your draw step, enchant player, “you may choose not to untap”, “all creatures able to block ~ do so”, …) | Typically 10–20 leftover lines each; see the leftover scan | Either no emit, no exact engine op, or a unique template that is not a compose frame | Individual ops / P4 systems / stay Limited |
| Manifest (non-dread) / cloak leftovers | Manifest dread shipped in #34; generic “manifest the top card” and cloak already have partial hookups, leftover is unusual sources or riders | Unusual manifest/cloak wording | Opportunistic, near existing `manifestCard` |

---

## 4. Parked (do not schedule unless Adam reopens them)

| Wording / mechanic | Approx. cards | Why it is parked | Waits on |
|---|---:|---|---|
| Mutate | 4 exclusive / 35 involved (31 leftover heads are “~ mutates”; plan-era 34 involved / 1 exclusive — involved is the useful figure) | Merged object, object-on-the-stack, ability distribution; easy to get wrong | A real mutate system (not planned) |
| Banding / bands with other | 40 exclusive / 47 involved (plan-era 38 exclusive / 47 involved) | Combat-math special case, low modern demand | A banding combat rewrite (not planned) |
| Attractions / open an attraction | 18 exclusive / 23 involved (16 leftover lines are “open an attraction”) | Un-set attraction deck and visit rules; large UI | Un-set product support (not planned) |
| Stickers / sticker sheets / draft-from-a-spellbook | 33 exclusive / 41 involved (13 leftover lines are “draft ~ face up”) | Un- / Convention product line, huge UI | Same as attractions (not planned) |
| Companion as a companion zone | 3 exclusive / 11 involved (plan-era 9 involved). Cards can still be used as a commander or in the 99 | Deck-construction restriction plus a special companion zone | Companion zone + deck-rule enforcement (not planned) |
| Subgames / restart the game / ante | 0 exclusive / 1 involved (Karn Liberated’s restart; ante cards are mostly not commander-legal) | Against the spirit of a normal Commander table, or a full game-within-a-game | Not planned |
| The Ring tempts you | 39 exclusive / 54 involved (17 leftover lines are exactly “the ring tempts you”) | The Ring emblem and its escalating reminders are a self-contained system | A Ring-tempts hook (parked with set mechanics; not P3) |
| Initiative (see also §3) | 15 exclusive / 26 involved | Tied to dungeons; parked with venture | Initiative + dungeon system |
| Un- / acorn, Conjure, Hidden/Double agenda, Augment/Host, Epic, Intensity, Specialize, Gotcha | Small or not commander-legal | Different product line, huge UI, or not in this corpus | Not planned |
| Exhaustive layers / “loses all abilities except…” of every shape | Opportunistic only | Full CR 613 would be an XL rewrite | Opportunistic pattern fixes only |
| Alchemy / digital-only | Outside this commander-legal corpus | Not commander-legal | Ignore unless import hits one by name |

---

## 5. Waiting on P4 / Batch 3 systems (not P3 compose frames)

These are listed so they are not mistaken for P3 work. P3 will not ship a wrong, simplified version.

| Wording / mechanic | Approx. cards | Why it waits | Waits on |
|---|---:|---|---|
| Replacement effects (“would … instead”) — leftovers | 293 exclusive / 385 involved (down from 300 / 393 after #38, and from 351 / 490 just before the first P4 PR) | The replacement engine shipped (see Done in P4). en-Kor “the next N damage that would be dealt to ~ / target creature this turn is dealt to (another) target creature you control instead” now parses. Leftovers: “would enter, sacrifice lands”, dice rolls, “would be destroyed, instead…”, “when you do, create a token”, empty-library draw (Ormos), explore-twice, and similar unique tails | Further replacement wording, or stay Limited |
| “As though” | Present in the hard bucket of the grammar plan | Permission / timing fiction | P4 |
| Day/night and phasing — leftovers | See §1 | Core systems shipped; leftovers are unique tails | Unique tails, or stay Limited |
| Enter-as-copy / become-a-copy | See §1 | Copiable values | P4 copy |

---

## 6. P3 compose frames (in progress)

This is the approved next phase. The compiler already has wrappers for several of these; leftovers are wording variants, missing conditions, or amounts. A failed `if` / cost / amount still fails the whole line (fail-closed). Figures are leftover-line families among current Limited cards, measured 2026-11-26. Exclusive numbers are generous (a line that merely contains “if” counts); honest flips will be lower and will be re-measured after each PR.

| Frame | Involved / exclusive (current, loose) | Notes |
|---|---:|---|
| `if` conditions (including “if you do”) | 4,034 / 3,221 `if`; 754 / 597 “if you do” / “when you do” | Mostly unchanged this pass. Remaining leftover `if` lines still fail a cond or wrap a verb that doesn’t parse |
| `you may` | 2,836 / 2,149 | Down from 2,888 / 2,183, largely because “you may … rather than pay” alt costs shipped. The may *wrapper* already exists; leftover `you may` almost always fails on the trigger head or the inner verb. Honest wrapper-only leftovers are things like “you may choose not to untap ~ during your untap step” (needs an untap-step choice) and “you may play that card”. “Choose new targets for target spell or ability” (and “for it” via the Commandeer script) now parse; leftover choose-new-targets lines are mostly “for the copy” or unique riders |
| `unless` | 360 / 301 | Down from 420 / 351 after “sacrifice/exile unless you [action]” and “unless [cond]”. Leftovers are mostly “can’t … unless [pay for each / unique cond]” and unique tails |
| Modes / choose one | 347 / 319 | Unchanged. The mode frame exists; leftovers are unmodelled effects *inside* a mode. Honest “all mode inners already parse” cases are rare (~7 lines) |
| Additional costs | 162 / 92 | Unchanged this pass (discard-X shipped in #35) |
| Alt costs / “without paying its mana cost” / “rather than pay” | 320 / 232 | Down from 373 / 267 after self alternative costs (WUBRG, sacrifice N, return N, tap-if-you-control, exile-a-color-from-hand). Remaining lines are mostly “cast ~ from elsewhere without paying” / copy-cast / “for spells you cast” (Fist of Suns / Jodah) |
| CDAs | 79 / 38 | Repeated “has / is a [color] [type] with base power and toughness N/N” / “loses all abilities and has base P/T” / “enchanted artifact is a creature with base P/T” shipped. Remaining are unique amounts (“life paid as it entered”, “highest number noted…”) and temporary/type-changing one-shots |
| Grants (“creatures you control get/have”) | 275 / 208 | Unchanged. Leftovers are unusual subjects (enchanted / modified / equipped / with counters) or quoted granted abilities |
| “Can’t” restrictions | 972 / 732 | Down from 985 / 743 after “can’t attack / block / attack or block alone”. Leftovers include “except by three or more”, Rule of Law–style spell limits, and unique can’ts |
| For each / where X is | 1,757 / 1,335 | Down slightly after “creature that died this turn”. Other amounts still reject (experience, cards named ~ in all graveyards, storage counters removed this way, …) |
| “Costs less” | 334 / 228 | Almost unchanged this pass (died-this-turn cost reduction flipped a couple) |
| Multi-sentence chaining | Common | Detectable “X. If you do, Y” shipped in #35. General second-sentence attach is still open. “You may choose not to untap” is a special static, not a compose wrapper |

As P3 PRs land, move finished wording out of this section into a short “Done in P3” note and drop the corresponding leftover counts.

### Done in P3

First P3 PR (compose frames), 2026-11-26. Support +129 to **17,389 / 32,643 (53.3%)**. Official precons stayed 100/100.

- Condition wording aliases onto existing conds: “it was bargained”, “it’s the first combat phase of the turn”, “at least N mana was spent to cast it”.
- New exact conds with runtime data already on the game: “you cast it” / “you cast it from your hand”, “~ is an [type]”, “~ is in your graveyard”, “an opponent lost life this turn”, “a creature died under your control this turn”, “no creatures are on the battlefield”, “that player has N or fewer cards in hand”, “you have a full party”, “there is a [filter] card in your graveyard”.
- Compose `A or B` when both sides parse as conditions (and the phrase is not “or more/fewer/less/equal/greater”). “You control a …” now falls through to that split when the filter itself doesn’t parse.
- Broader “X. If you do, Y” only when success of X is detectable (`sac` / `discard` / `mill` / `search` / `destroy` / `exile` / `draw` / `lose` / `blight` / `ret` / `putLand`, or a `may` of those). Tap / pump / un-detectable first verbs stay fail-closed. `ifDid` now snapshots chosen, created, destroyed, lost-this-way, hand, graveyard, and paid flags.
- Additional cost: “as an additional cost to cast this spell, discard X cards” (`extraCost.discardX`), including can-cast, max X, and payment.
- For-each / costs-less: “for each creature in your party” (`Amt` `{ party: true }`) and “this spell costs 39 less to cast for each creature in your party”. Party is the official unique-among-Cleric/Rogue/Warrior/Wizard count.

Still open after the second P3 PR: leftover `you may` that fail on the head or inner verb (plus choose-not-to-untap, play-that-card, choose-new-targets); remaining unless tails; modes; remaining alt costs (cast-from-elsewhere / “for spells you cast”); unique CDAs; grants with unusual subjects or quoted abilities; remaining “can’t” (except-by-three-or-more, Rule of Law, …); other for-each / where-X amounts; general multi-sentence chaining.

Second P3 PR, 2026-11-26. Support +127 to **17,516 / 32,643 (53.7%)**. Official precons stayed 100/100.

- Alternative costs rather than the mana cost: pay `{W}{U}{B}{R}{G}` (or any parsed mana), sacrifice N [filter], return N [filter] you control to hand, pay 39 and return a land, “if you control a [type], you may tap an untapped [filter]” or sacrifice one, and “exile N [color] cards from your hand” (wired through existing `exileAlt`). Runtime hook is `CastOpts.useAlt` / `CardDef.altCost`. Optional; the printed mana cost still works.
- “Sacrifice/exile it unless you [action]” (`unlessAct`) when the alternative action’s success is detectable (discard, return, sacrifice, exile, …), fail-closed if the player declines or the action doesn’t happen.
- “X unless [condition]” composes as `if not cond, X` when the right-hand side is a condition (including “it escaped” and “{U} was spent to cast it”). Escape no longer clears the `escaped` flag on ETB, and spent colors from the payment plan are stored on the spell/permanent.
- Repeated base-P/T CDAs: “loses all abilities and is a [color] [type] creature with base power and toughness N/N”, “loses all abilities and has base P/T”, “has base P/T”, “enchanted artifact is a creature with base P/T in addition to its other types”. `basePT` layering now applies `applyCEs` (lose-all, set color, set creature types, add types).
- “~ can’t attack alone”, “~ can’t block alone”, and “~ can’t attack or block alone” (`noAtkAlone` / `noBlockAlone`), enforced at declare-attackers / declare-blockers.
- For-each / costs-less: “for each creature that died this turn” (`Amt` `{ died: true }`, the global `g.died` count).

### Done in P4

First P4 PR (replacement effects), 2026-11-26. Support +50 to **17,566 / 32,643 (53.8%)**. Official precons stayed 100/100. 747 tests.

- A replacement-effect system (`CardDef.replacements`, `Game.tempRepls`, CR 614 apply-once and CR 616 buckets: self-replacements, then zone-changing, then the rest). The affected object’s controller (or owner / affected player) would choose; the AI picks a sensible option (maximize tokens/counters/life/draw, prevent or redirect incoming damage, apply plus-then-multiply so doubling compounds, prefer shuffle over exile for your own card, skip an opponent’s extra turn). `Game.pickRepl` is a test hook.
- Hooked events: would-die / would-be-put-into-a-graveyard (including mill and a spell leaving the stack), damage, draws (per card), token creation, counters, life gain, and beginning an extra turn. Existing `tokenDouble` / `plusP1P1` / `plusCharge` / `doubleLife` / `doubleDraw` statics participate as synthetics in the same 616 loop where those events now go through it. `noPrevent` still blocks prevention replacements.
- Parsed continuous wordings: “if ~ would be put into a graveyard from anywhere, exile / reveal and shuffle into its owner’s library instead”; “if ~ would die, exile it instead”; “if a [filter] would die, exile it instead” (including “a creature an opponent controls” and “a creature dealt damage by ~ this turn”); Rest in Peace–style “card or token … from anywhere, exile instead”; twice-as-many +1/+1 or any counters; additional Treasure token; floor life at 1; redirect damage to ~ / enchanted creature / you and other permanents you control; double damage; another [color] source you control deals plus 1; skip extra turns; “if you would gain life, draw that many cards instead”; “if you would draw a card, draw two instead”.
- Wording variant: “if an effect would create one or more tokens under your control, it creates twice that many…” now hits the existing `tokenDouble` static (Doubling Season, Anointed Procession, Parallel Lives). `doubleLife` / `plusCharge` actually apply at the event (they previously compiled but had no engine hook).
- Spell tails: “deals N to any target / target creature or planeswalker. If [that / a creature dealt damage this way] would die this turn, exile it instead”; “if a creature would die this turn, exile it instead” as a this-turn `tempRepl`.

Second P4 PR [#38](https://github.com/adimego/mtg-commander/pull/38) (clones, end-of-combat, phasing keyword, cheap would/instead leftovers), 2026-11-26. Support +99 to **17,665 / 32,643 (54.1%)**. Official precons stayed 100/100. 759 tests.

- Enters-as-a-copy / become-a-copy (CR 707): `enterCopy` as an `asEnters` replacement and `becomesCopy` for eot / activated copies. Copiable values still come from `CARDS[t.id]` (the current object, including prior copy effects, not layer pumps). Modelable excepts: typal “in addition to its other types”, “isn’t legendary”, “its name is ~”. Anything else (quoted abilities, shield/vanishing riders, mixed Spark Double excepts) is fail-closed and left to scripts where they already exist. The AI picks the highest-`value` copy target, including “you may”.
- End-of-combat step inserted after damage and before main 2. Delayed “at end of combat” effects keep `evCard`. `blockedBy` / `attacking` / `blocking` are cleared only when leaving `endCombat` (or on an extra combat after that step). True “at end of combat” triggers, “BODY at end of combat” delayed tails, “if ~ attacked or blocked this combat”, and “each creature blocking or blocked by ~” all compile. Extra combats and “end the combat phase” go through `endCombat` first. Firebending mana still expires as the step begins.
- Combat damage to a creature: per-recipient `combatDamageCreature` emit with the damaged creature as `evCard`. Existing `combatDamage` / `combatDamagePlayer` are unchanged. “Becomes blocked by a [filter]” uses a per-blocker `blockedBy` event so “destroy that creature” has a recipient.
- Phasing keyword: at the start of the controller’s turn, permanents with phasing phase out *before* last turn’s phased-out permanents phase in (CR 502.1). “Phases in / phases out” abilities are still leftover.
- Cheap would/instead: “if you would draw a card while you have no cards in hand, draw two cards instead”; “if you would gain life while you have 5 or less life, you gain twice that much life instead”.
- P/T counters other than +1/+1 and −1/−1 (e.g. −0/−2, +1/+0) now apply to power and toughness.

Not in that PR: day/night and daybound/nightbound (then 36 exclusive). Remaining copy excepts (98 exclusive) and remaining EOC unique bodies (46 exclusive / 58 involved) were left as unique tails.

Day/night and shared-piece sweep PR [#39](https://github.com/adimego/mtg-commander/pull/39), 2026-11-26. Support +118 to **17,783 / 32,643 (54.5%)**. Official precons stayed 100/100. 780 tests.

- Day/night (current CR 732, formerly sometimes cited as 726 — 726 is now The Monarch) and daybound/nightbound (CR 702.145): the game starts as neither; once day or night, it stays one of those. The 502.2 check runs in the untap step after phasing and before permanents untap, using the previous active player's spell count (`p.spells`). Daybound DFCs enter transformed if it is night, and a daybound permanent makes it day if it was neither (702.145d); a nightbound permanent makes it night only if there is no daybound permanent (702.145g). Transforms happen immediately, not as an SBA. Ordinary `transform` cannot flip a daybound/nightbound permanent. “Whenever day becomes night or night becomes day” fires only when the designation changes from one to the other, not from neither. The Celestus toggle and “if it's neither, it becomes day as ~ enters” parse. Old Innistrad werewolves use the shared “no spells / a player has cast two or more spells last turn” upkeep conditions (total spells last turn, not only the previous active player). The AI prefers night when it controls daybound or nightbound permanents and does not stall spells just to force night. A Day/Night chip is shown in the header.
- Shared-piece sweep (engine hooks and templates that unlock multiple cards): phase in/out verbs and `phasesIn` / `phasesOut` events, including plural “phase out”; en-Kor-style next-N-damage redirect (`redirectNext`); stack copies of “copy target instant or sorcery spell” (Twincast family) and “when you next cast an instant or sorcery this turn, copy that spell” (`nextCopyIS` / existing `g.nextIS`); “target player takes an extra turn after this one”; Final Fortune’s “at the beginning of that turn’s end step, you lose the game”. Unique one-offs (Tovolar, “permanents can't phase in”, coin-flip extra turns, ability copies, etc.) stayed fail-closed.

Not in this PR: the P5 AI card-script hook (plan only, in the work notes); remaining unique copy-except, EOC, would/instead, phase, stack-copy, and extra-turn tails.



### Done in popular Batch 1

Popular-card Batch 1 (the 29 Limited cards in the positional top 250 by `edhrec_rank`), 2026-11-26. Support +63 to **17,846 / 32,643 (54.7%)**. Official precons stayed 100/100. 804 tests.

Top-N (positional among ranked commander-legal cards, same corpus as the support reports):

- Top 100: 93/100 (93.0%) → **100/100 (100%)**
- Top 250: 221/250 (88.4%) → **250/250 (100%)**
- Top 500: 419/500 (83.8%) → **449/500 (89.8%)**
- Top 1,000: 786/1,000 (78.6%) → **817/1,000 (81.7%)**

All 29 Batch 1 cards classify `auto` from official Oracle. The extra +34 corpus flips are spill from the shared hooks (channel-for-legendaries, land-type grants, imprint mana, exile-from-hand alt costs, and so on).

Shared hooks (hand-written compiler + engine, no AI-written scripts):

- “Each land is a Swamp/Forest in addition to its other land types” (`addLandType`), composing with printed types and with each other (Urborg, Yavimaya).
- Channel cost reduction “this ability costs {1} less to activate for each legendary creature you control” (`lessLegend`) — Boseiju, Otawara, Takenuma, and the other channel lands.
- Protection from everything as a player flag (`protAll`) that stops targeting and damage but does not lock life or phase permanents (The One Ring; distinct from Teferi’s Protection).
- Mana-drain “at the beginning of your next main phase, add {C} equal to that spell’s mana value” (`delayMain`), snapshotting MV when the spell is countered.
- Windfall; Victimize’s two-target / sacrifice / return; imprint exile from hand plus `IMPRINT` mana (Chrome Mox); Mox Diamond’s “discard a land or it never enters”; Gemstone Caverns luck counters (`leylineLuck`, `luckAny`).
- `LEGEND_CP` / `EACH_COLOR` mana (Mox Amber, Bloom Tender, Nykthos devotion with `{2}, {T}`); uncounterable typal/legendary mana (`*Unc`, Delighted Halfling, Cavern of Souls, Rhythm of the Wild).
- Force of Will `exileAlt.life`; “choose new targets for target spell or ability” (`retarget`, CR 115.7d — current targets stay legal); bounce a spell or a permanent (Sink into Stupor); Food-or-Treasure (`tokenOr`); granting a dies-return ability (`gainAbil`) with an LKI snapshot so the trigger still exists after `leave()` clears CEs (Malakir Rebirth); Grand Abolisher (`oppsCantAct`) also shutting off auto mana abilities of artifacts, creatures, and enchantments via `tapForMana` / `planPayment`.

The AI has sensible defaults for each of those may/pick/search/retarget decisions. Script-kind `retarget` / `commandeer` still dispatch through `scriptOp` so Redirect Lightning and Commandeer keep working.

