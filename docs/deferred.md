# Deferred leftovers

Living list of Oracle wording and mechanics that are **not** modelled yet, or were only modelled in a simple form and still leave cards Limited. Counts are from the same Scryfall Oracle Cards bulk and `classify()` method used for support reports (unique `oracle_id`, commander-legal, excluding tokens, emblems, dungeons, planes, phenomena, schemes, vanguards, conspiracies, and commander-banned cards). Corpus size: **32,643**.

**Last updated:** 2026-11-26, after the first P3 compose-frames PR (this file’s repo copy ships with that PR). Support is **17,389 / 32,643 (53.3%)** — auto 17,228, builtin 161, Limited 15,254. Baseline after P2 PR [#34](https://github.com/adimego/mtg-commander/pull/34) was 17,260 / 32,643 (52.9%).

**How to read a row.** *Involved* is how many current Limited cards have at least one leftover line in the family. *Exclusive* is how many of those cards have every leftover line in that family, so modelling the family *could* flip the card if the inner effect is also exact. Families overlap; do not add rows. Plan-era figures are labelled when a current recount was not the source.

This file is the copy in the work notes. The in-repo copy is `docs/deferred.md` and should stay in sync when a PR lands.

---

## 1. Keywords plan A–K leftovers

Phases A–K shipped a large set of ability-word conditions, combat keywords, alt-cost / from-zone keywords, storm/split second, two-commander pairing flags, clock counters, energy, split/fuse/aftermath/flip layout, and some variable P/T CDAs. What remains is almost never the original keyword itself. It is a rider, an unusual cost, a replacement, or a system that was parked or moved to a later phase.

| Wording / mechanic | Approx. cards (current unless noted) | Why it was deferred | Waits on |
|---|---:|---|---|
| Ability-word *riders* still unparsed (Landfall “if that land is a Mountain”, unique Delirium/Domain/Threshold tails, Channel variants, etc.) | Plan A estimated a few dozen unique tails after the core conds shipped; leftovers now sit inside P3 `if` / grant / for-each frames rather than as missing words | The prefix already strips; the leftover is a condition or effect the compiler still rejects | P3 compose frames (conditions, grants, amounts); unique tails may stay Limited |
| Enter as a copy / become a copy | 118 exclusive / 137 involved | Copiable values, “except” clauses, and layer interactions are their own system | P4 replacements / copy |
| Copy a spell or ability (unusual stack-copy leftovers) | Plan J: 75 exclusive / 117 involved at the time; many simple copies later shipped | Remaining lines are except-clauses, modal copies, or replacements | P4 copy / stack-copy |
| Extra turns | Plan J: 18 exclusive / 32 involved | Turn-cycle hook, extra-turn triggers, “you lose if you would take an extra turn” | P4 |
| Votes / Will of the council / Council’s dilemma / Tempting offer | Plan K: ~24+ exclusive | Multi-player vote UI and AI | A later vote system (not P3) |
| Monarch *leftover effects* (the monarch itself already exists) | A few dozen leftover lines mention the monarch; core “you’re the monarch” conds already parse | Court-cycle and unique monarch riders | P3 if the rider is a known verb; otherwise unique tails |
| Role tokens | Plan K: 28 exclusive | Token subtypes with attached auras and a special sheet | A later role-token hook |
| Learn / Lessons | Plan K: 17 exclusive | Needs a lesson pile or a simplified search-from-sideboard policy | Product decision + search hook |
| Collect evidence / suspected / case “solved” leftovers | Small; cases are partly flagged | Evidence counts and suspected status aren’t general | A later set-mechanic pass |
| Amass / Investigate / Proliferate / Explore / Connive / Discover *riders* | Keyword actions often parse; leftover is a following sentence | Fail-closed on the rider, not the keyword | P3 multi-sentence chaining when the rider is a known verb |
| Haunt, Forecast, Escalate leftovers, Max-speed leftovers, Gift leftovers, and similar half-done keywords | Typically ≤11 exclusive each in the original catalog | Unusual activation windows or leftover templates after the simple form shipped | Opportunistic keyword cleanup, not a P3 frame |
| Daybound / nightbound / “it becomes day/night” | 36 exclusive / 47 involved | Shared day/night state, transform-if-no-spells-last-turn | Batch 3 / P4 day-night |
| Phasing / phases in / phases out | 48 exclusive / 63 involved | Zone-like special status and phasing timing | Batch 3 / P4 phasing |

---

## 2. Blockers Batch 1 / 2 leftovers

Batch 1 shipped Tribute plus the cheap repeated keywords. Batch 2 shipped Energy, split/fuse/aftermath, flip faces, and common variable-P/T CDAs. These are the leftovers that were called out as not exact enough (or not in scope) at the time.

| Wording / mechanic | Approx. cards | Why it was deferred | Waits on |
|---|---:|---|---|
| Energy *alt costs* and unusual get/pay phrasing (pay `{E}` as an additional or alternative cost, “you may pay `{E}` rather than…”, activations that aren’t the simple `{E}` cost) | 61 exclusive / 68 involved among remaining energy leftover lines | Batch 2 modelled the `{E}` pool, “you get `{E}`”, paying `{E}` in ordinary costs, and “energy counters you have” amounts. Alt-cost wording and mixed additional costs were fail-closed | P3 additional / alt costs, then any energy-specific cost hook still needed |
| Split halves that still don’t compile (one half’s effect is unmodelled, or a structural leftover after fuse/aftermath) | Layout support shipped for both faces, fuse, and aftermath; remaining Limited split cards fail on an effect inside a half, not on being split | The leftover is a verb or frame inside the half | P3 if that frame/verb is composed; otherwise the unique effect |
| Flip *conditions* (when to flip, “~ is flipped”, flipped-face CDAs/statics) | Flip *faces* compile when the back is a normal face; leftover is the flip condition or a flipped-only static | Needs a reliable flipped-state cond and, for some cards, a CDA that only applies while flipped | P3 conds if the condition is exact and cheap; otherwise P4 |
| Odd CDAs (power/toughness equal to an amount `amount()` still rejects, or a CDA that isn’t “P/T are each equal to [count]” / “toughness is that number plus N”) | 37 exclusive / 79 involved among remaining CDA leftover lines | Batch 2 covered the common count-based shapes and hooked them to the existing `statics` P/T path. Unusual amounts and hybrid CDAs were fail-closed | P3 for-each / where-X amounts when the amount is exact; unique CDAs stay Limited |
| Odd ward costs (ward that isn’t `{N}`, “pay N life”, or blight) | 15 exclusive / 32 involved | Simple ward shipped; leftover costs (discard, exile, sacrifice, typal, etc.) were out of Batch 1’s “unusual leftover ward” cut | A small ward-cost parser, or P3 additional-cost pieces if they compose exactly |
| Partner-with ETB / search cleanup (“when ~ enters, you may search for [partner], reveal it, put it into your hand…”) | 13 exclusive / 28 involved (plan-era 17 / 47) | Pairing itself shipped so two commanders can be chosen. The ETB/search reminder was optional in Batch 1 and later parked in the grammar plan | A dedicated Partner-with ETB script/parser; not a P3 frame |

---

## 3. P2 leftovers (simple leftover verbs / trigger heads)

P2 only wires a trigger head when the engine already emits that event (or a new emit is a local, exact hook). Verb bodies must match official rules. These were measured after PR #34.

| Wording / mechanic | Approx. cards | Why it was deferred | Waits on |
|---|---:|---|---|
| Venture into the dungeon / complete a dungeon | 28 exclusive / 40 involved (20 leftover lines are exactly “venture into the dungeon”) | No dungeon state machine. A simplified venture counter was allowed only if it matched existing dungeon support; there is none | A dungeon / venture system (Batch 3 / P4-adjacent) |
| Take the initiative / the initiative | 15 exclusive / 26 involved (20 leftover lines are “you take the initiative”) | Same underworld-dungeon complex; parked with venture | Initiative + dungeon system |
| End-of-combat triggers (“at end of combat”, “destroy that creature at end of combat”) | 89 exclusive / 107 involved (14 leftover heads are exactly “end of combat”; 16 lines are “destroy that creature at end of combat”) | `clearCombat` currently runs in the same `enterStep('main2')` as delayed end-of-combat, which would wipe `blockedBy` before Greater Werewolf–style effects resolve. Shipping a wrong hook was rejected | Combat-step cleanup: emit/queue end-of-combat before combat data is cleared, and only then clear |
| “~ deals combat damage to a creature” | 29 exclusive / 39 involved (27 leftover heads) | The `combatDamage` emit has no recipient, so the head cannot be exact | Extend the combat-damage event with a recipient (creature vs player/planeswalker) |
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
| Replacement effects (“would … instead”) | 398 exclusive / 556 involved | Needs a replacement engine, not a compose wrapper | P4 replacements |
| “As though” | Present in the hard bucket of the grammar plan | Permission / timing fiction | P4 |
| Day/night and phasing | See §1 | Shared turn-level systems | Batch 3 / P4 |
| Enter-as-copy / become-a-copy | See §1 | Copiable values | P4 copy |

---

## 6. P3 compose frames (in progress)

This is the approved next phase. The compiler already has wrappers for several of these; leftovers are wording variants, missing conditions, or amounts. A failed `if` / cost / amount still fails the whole line (fail-closed). Figures are leftover-line families among current Limited cards, measured 2026-11-26. Exclusive numbers are generous (a line that merely contains “if” counts); honest flips will be lower and will be re-measured after each PR.

| Frame | Involved / exclusive (current, loose) | Notes |
|---|---:|---|
| `if` conditions (including “if you do”) | 4,051 / 3,228 `if`; 755 / 597 “if you do” / “when you do” | Down from 4,177 / 3,329 and 777 / 617 after the first P3 PR. Remaining leftover `if` lines still fail a cond or wrap a verb that doesn’t parse |
| `you may` | 2,888 / 2,183 | Not the focus of the first P3 PR (down slightly from 2,897 / 2,187 as side-effect flips). Most leftovers still fail on the inner verb |
| `unless` | 420 / 351 | Pay-unless and similar; keep fail-closed. Not started |
| Modes / choose one | 347 / 319 | The mode frame exists; leftovers are unmodelled effects *inside* a mode. Not started |
| Additional costs | 162 / 92 | Down from 172 / 97 after “discard X cards” shipped. Other additional-cost wordings remain |
| Alt costs / “without paying its mana cost” / “rather than pay” | 373 / 267 | Overlaps energy alt costs and flashback-like leftovers. Not started |
| CDAs | 79 / 37 | Remaining odd amounts; see §2. Not started as a frame |
| Grants (“creatures you control get/have”) | 275 / 208 | Static grants the compiler doesn’t yet accept. Not started |
| “Can’t” restrictions | 985 / 743 | Many are unique; start with repeated attack/block/activate shapes. Not started |
| For each / where X is | 1,767 / 1,340 | Down from 1,786 / 1,353 after “creature in your party” amounts. Other amounts still reject |
| “Costs less” | 337 / 229 | Down from 348 / 235 after party cost reduction. Other self- and typal leftovers remain |
| Multi-sentence chaining | Common | Second sentence is a known verb or “if you do” but isn’t attached today, except the detectable “X. If you do, Y” cases below |

As P3 PRs land, move finished wording out of this section into a short “Done in P3” note and drop the corresponding leftover counts.

### Done in P3

First P3 PR (compose frames), 2026-11-26. Support +129 to **17,389 / 32,643 (53.3%)**. Official precons stayed 100/100.

- Condition wording aliases onto existing conds: “it was bargained”, “it’s the first combat phase of the turn”, “at least N mana was spent to cast it”.
- New exact conds with runtime data already on the game: “you cast it” / “you cast it from your hand”, “~ is an [type]”, “~ is in your graveyard”, “an opponent lost life this turn”, “a creature died under your control this turn”, “no creatures are on the battlefield”, “that player has N or fewer cards in hand”, “you have a full party”, “there is a [filter] card in your graveyard”.
- Compose `A or B` when both sides parse as conditions (and the phrase is not “or more/fewer/less/equal/greater”). “You control a …” now falls through to that split when the filter itself doesn’t parse.
- Broader “X. If you do, Y” only when success of X is detectable (`sac` / `discard` / `mill` / `search` / `destroy` / `exile` / `draw` / `lose` / `blight` / `ret` / `putLand`, or a `may` of those). Tap / pump / un-detectable first verbs stay fail-closed. `ifDid` now snapshots chosen, created, destroyed, lost-this-way, hand, graveyard, and paid flags.
- Additional cost: “as an additional cost to cast this spell, discard X cards” (`extraCost.discardX`), including can-cast, max X, and payment.
- For-each / costs-less: “for each creature in your party” (`Amt` `{ party: true }`) and “this spell costs {N} less to cast for each creature in your party”. Party is the official unique-among-Cleric/Rogue/Warrior/Wizard count.

Still not started as frames: `you may` leftovers, `unless`, modes, alt costs, remaining CDAs, grants, “can’t”, other for-each / where-X amounts, and general multi-sentence chaining.
