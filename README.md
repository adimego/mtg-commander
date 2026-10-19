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
- `src/engine/engine.ts` — rules engine (pure state + functions)
- `src/engine/ai.ts` — heuristic AI (lands, best affordable spells, safe attacks on weakest opponent, survival blocks)
- `src/engine/controller.ts` — game loop glue
- `src/App.tsx` — UI

## Known gaps
- "You may" choices are always taken. "Up to" searches take the maximum. The mulligan bottom pick and discards are automatic.
- Mana is paid automatically and there is no floating mana pool, so leftover mana from Sol Ring is lost.
- No tokens, counters, auras, equipment, planeswalkers, X spells, or modal/kicker cards. Those cards are skipped.
- If Judith dies at the same moment as other creatures, the other deaths don't trigger her.
- A commander that is bounced goes to its owner's hand; there's no choice to send it to the command zone.
- Triggers you control go on the stack in a fixed order; you can't reorder them.

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
