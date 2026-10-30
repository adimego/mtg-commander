# Commander Arena — a Commander-format MTG browser game

A playable first version of a Magic: The Gathering–style game focused on the **Commander** format: you vs. 3 AI opponents in a 4-player free-for-all. Runs entirely in the browser (TypeScript + React + Vite, no server).

## Run
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest unit tests for the rules engine
npm run build    # production build into dist/
```

## Rules implemented
- 4-player FFA, 40 life, 100-card singleton decks with a legendary commander, color-identity validation
- Zones: library, hand, battlefield, graveyard, exile, command zone, and **the stack**
- Commander tax (+{2} per previous cast from the command zone). A commander that would die, be exiled or be countered goes to the command zone.
- Commander damage: 21 combat damage from a single commander eliminates a player
- **Stack and priority:** spells, activated abilities and triggers go on the stack and resolve last in, first out.
  - Priority passes around all living players. The top item resolves only when everyone passes in a row; when everyone passes with an empty stack, the step ends.
  - Instants, flash cards and abilities can be used whenever you have priority, including on opponents' turns and during combat steps.
  - Spells whose target has disappeared fizzle.
  - Counterspells: Counterspell, Cancel, Negate, Essence Scatter, and Dovin's Veto (which can't be countered).
- **Mana abilities** don't use the stack. Lands, Sol Ring (2 mana from one source), Mind Stone, Arcane Signet, Commander's Sphere, Llanowar/Fyndhorn Elves, Elvish Mystic, Birds of Paradise, Llanowar Visionary and Drumhunter are tapped automatically to pay costs. Mana creatures obey summoning sickness.
- **Activated abilities** with tap, mana and sacrifice costs: Prodigal Pyromancer, Royal Assassin, Seal of Fire, Sakura-Tribe Elder, Mind Stone, Commander's Sphere, Wayfarer's Bauble, Burnished Hart
- **Triggered abilities**, placed on the stack in APNAP order (the active player's triggers go first, so they resolve last). The human picks targets for their own targeted triggers.
  - Enters the battlefield: Elvish Visionary, Wall of Omens, Flametongue Kavu, Ravenous Chupacabra, Man-o'-War, Solemn Simulacrum
  - Dies: Perilous Myr, Solemn Simulacrum, Judith
  - Attacks: Isperia
  - Combat damage to a player: Sergeant John Benton, Thieving Magpie
  - Upkeep: Phyrexian Arena
  - End step: Owlbear Shepherd, Drumhunter (conditional)
  - Cast: Guttersnipe, Ruric Thar, prowess
- Turn steps: untap, upkeep, draw, main 1, declare attackers, declare blockers, first-strike damage (only when needed), combat damage, main 2, end, cleanup (damage wears off, discard to 7)
- Keywords: flying, reach, trample, haste, vigilance, lifelink, deathtouch, first strike, double strike, menace, defender, flash, hexproof, prowess. Also "attacks each combat if able".
- Mulligan: first one free, then bottom one extra card per further mulligan
- Losing: 0 life, 21 commander damage, drawing from an empty library. The last player standing wins.

## Priority and auto-pass
By default **smart auto-pass** keeps the game fast. You only get priority when:
- it's your main phase;
- the top stack item targets you or something of yours;
- an opponent's item is on the stack and you have an instant, flash card or targeted ability you could use;
- combat blocks are declared, you're in the fight, and you have a response.

Turn on **Hold priority** in the header to stop at every priority point, including on your own spells. **End turn** auto-passes for the rest of your turn. The blue prompt bar ("🔔 You have priority…") shows when it's your call, and the stack panel in the right sidebar lists every item with its art, kind (spell, ability, trigger), controller, target, and which one resolves next.

## Commanders
| Deck | Commander | Ability |
|---|---|---|
| Azorius Tribunal (WU) | Isperia, Supreme Judge | Flying. Whenever a creature attacks you, draw a card |
| Rakdos Scourge (BR) | Judith, the Scourge Diva | Other creatures +1/+0. Whenever a creature you control dies, 1 damage to any target |
| Gruul Unbowed (RG) | Ruric Thar, the Unbowed | Reach, vigilance, must attack. 6 damage to any player who casts a noncreature spell |
| Selesnya Intelligence (GW) | Sergeant John Benton | Trample, haste. Combat damage to a player: you and that player each draw that many |

## Code layout
- `src/engine/engine.ts`: the rules engine (pure state + functions). Effects resolve resumably, so a choice pauses resolution and resumes after the answer.
- `src/engine/oracle.ts`: the Oracle-text compiler. It turns card text into triggers, activated abilities, statics and effect ops.
- `src/engine/ai.ts`: the heuristic AI. It handles targets per slot (harm-aware), modes, X, kicker, may/pick/scry choices, ability use, attacks and blocks.
- `src/engine/controller.ts`: game loop glue.
- `src/App.tsx` and `src/Dialogs.tsx`: the UI and the choice dialogs.
- `scripts/coverage.ts`: the compiler coverage report. Results are in [docs/coverage.md](docs/coverage.md).
- `scripts/fuzz.ts`: AI-only stress games built from random supported cards.

## Activated & triggered abilities
The compiler supports:
- Triggers: ETB, dies, attacks/blocks, combat damage, upkeep/end step, cast, landfall, draw, and others.
- Activated costs: {T}/{Q}, mana and X, sacrifice, discard, life, counters, exile from graveyard, and tapping creatures.
- Loyalty abilities.
- Equip.
- Cycling and other hand abilities.
- Graveyard abilities and flashback.
- Modal spells and abilities.
- Kicker.
- "you may … if you do".
- "unless … pays".
- Tokens, counters and tutors.
- Scry and surveil.
- Shock lands, check lands and pain lands.
- Devotion.

Choices go to a dialog when you make them and to heuristics when the AI does. The choices are: may, modes, X, kicker, targets (one prompt per target slot, optional slots can be skipped), pick-cards, scry/surveil and trigger ordering.

Mana is paid automatically. You can also click a land chip (or a mana creature without other abilities) to float mana in your pool, and spells spend the pool first.

Partner commanders both sit in the command zone, and each has its own tax.

Cards whose text doesn't fully compile keep a **Limited** badge and play only the parts that work. Coverage: see [docs/coverage.md](docs/coverage.md).

## Known gaps
- Replacement effects are missing (Doubling Season, Hardened Scales), as are emblems, sagas, vehicles, delayed "next upkeep" triggers and cumulative upkeep.
- Most planeswalker ultimates and choose-a-creature-type cards are not supported.
- Library arranging (Ponder, Sensei's Top) is not supported.
- A commander that is bounced goes to its owner's hand.

## Desktop UI & controls

Built for PC, full screen (tuned for 1920×1080; checked at 1440×900 and 2560×1440). The page never scrolls. Opponents sit across the top and your battlefield fills the bottom, in creature, noncreature and land rows. Your hand fans out and lifts when you hover it. Hovering any card shows a large preview with a keyword glossary. The stack appears in the centre, and the main action button is at the bottom right.

| Key | Action |
|---|---|
| Space | Primary action (pass / resolve / next step / confirm) |
| Enter | Confirm (keep hand, attacks, blocks) |
| Esc | Close dialog / clear selection |
| E | End turn |
| A | Attack with everything at the chosen player |
| F | Toggle full screen |
| L | Toggle log |
| ? / H | Help overlay |

Attacking: click an opponent's panel to pick who you attack, then click creatures or drag them onto a player. Targets glow while you are choosing. ⚙ Settings has AI speed, smart auto-pass, hold priority and animations, and can show the first-game tips again. Click 🪦 or ⛔ on any player to view their graveyard or exile.

**Blocking:** when you're attacked, drag an untapped creature onto an attacker.
- While you drag, a live arrow follows the cursor. Attackers you can legally block glow ✓; illegal ones dim and show the reason (✕ Flying, for example). Menace attackers are flagged until they have at least two blockers.
- A planned block shows as a dashed blue line. Several creatures can block the same attacker.
- To unassign a blocker, right-click it or drag it onto empty space. Right-clicking an attacker clears all of its blockers.
- Click your creature, then click the attacker, still works. Enter or Space confirms.

## Importing your own decks

On the start screen, click **＋ Import deck**. Paste a list, or load a `.txt` or `.dek` file. The game then looks the cards up on Scryfall from your browser, using `/cards/collection` in batches of 75. Any name it can't find goes through `/cards/named?fuzzy=`, and the report shows what it matched.

**Formats:**
- Simple lines: `1 Sol Ring`, `1x Sol Ring`, or a bare `Sol Ring`.
- Set codes and collector numbers: `1 Sol Ring (CMR) 472`. Foil and etched markers such as `*F*` are ignored.
- Commander markers: `*CMDR*`, or Archidekt `[Commander]` categories. Archidekt colour tags are ignored.
- Arena and Moxfield `Commander` / `Deck` section headers.
- MTGO `.txt`, where the commander is in `SIDEBOARD:`; Moxfield plain exports, where the commander is in a trailing block after a blank line; and MTGO `.dek` XML.
- Maybeboard, Considering, Tokens and Companion sections are skipped.

**Support check:** every card gets one of three levels.
- **Fully supported:** it's one of the built-in cards, or every line of its rules text is something the engine handles. That covers supported keywords, `{T}: Add …` mana abilities (including "W or U" duals and "any color"), and "enters tapped".
- **Limited support:** anything else.
  - Permanents play with their printed power/toughness and supported keywords only.
  - Instants and sorceries resolve with no effect.
  - Lands keep their mana ability.
  - X costs count as 0, and hybrid or Phyrexian symbols count as generic mana. Variable P/T plays as printed numbers, or 0/1.
  - Double-faced and split cards use the front face.
  - In game these cards carry a yellow **Limited** badge, and the preview explains exactly what is simplified.
  - When importing you can keep them, or swap nonland limited cards for basics of your colors.

**Legality:**
- The checks: 100 cards including the commander; singleton, except basics and "any number of cards named" cards; color identity from Scryfall; Commander bans and legality; the commander must be a legendary creature or say "can be your commander"; partner pairs.
- Problems are listed. You can still **Save anyway (casual)**, and the deck is tagged *Casual*.
- Partner pairs are checked, but the engine has a single command-zone slot: the second partner is shuffled into your library.

**Your decks:** saved decks are stored in your browser (`localStorage`) and listed under **My decks** with the commander's art. Each one has Rename, Export (copies a `*CMDR*`-marked list to the clipboard and downloads it as `.txt`) and Delete. Under **AI opponents use** you can let the AI play your imported decks too.
