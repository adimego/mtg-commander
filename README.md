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
- Zones: library, hand, battlefield, graveyard, exile, command zone
- Commander tax (+{2} per previous cast from the command zone); commander returns to the command zone when it would die
- Commander damage: 21 combat damage from a single commander eliminates a player
- Turn steps: untap, upkeep, draw, main 1, declare attackers, declare blockers, combat damage, main 2, end (cleanup: damage wears off, discard to 7)
- Mana from lands/mana rocks with automatic payment; Command Tower / Prism Signet make any color in your identity
- Creatures, sorceries, instants, artifacts, enchantments (anthems, upkeep life gain)
- Combat: attack any opponent (each attacker can pick a different one), multiple blockers, summoning sickness
- Keywords: flying, trample, haste, vigilance, lifelink, deathtouch, first strike
- Mulligan: first one free, then bottom one extra card per further mulligan
- Losing: 0 life, 21 commander damage, drawing from an empty library; last player standing wins

## How to play
The gold bar under the phase bar always tells you what to do next. Hover any card to see it large in the right panel. Arrows show attackers and blocks. Each player has a big life total, a command-zone slot with a tax badge, and commander damage counters (x/21) for every opponent.

Pick a deck, keep or mulligan, then: click glowing hand cards to play lands / cast spells (targeted spells highlight valid targets in green). Your commander sits at the left of your hand while in the command zone. "Go to combat" → choose a player with "Attack this player" and click creatures to assign them → Confirm. When attacked, click your creature then the attacker to block → Confirm blocks.

## Cards
Real Magic cards that the engine can model exactly, fetched from the [Scryfall API](https://scryfall.com/docs/api) by `npm run fetch:cards` (`scripts/fetch-cards.mjs`). The script sets a User-Agent, waits about 120 ms between requests, and pulls the final data in batches through `/cards/collection`. The results go into `src/data/cards.json` and `decks.json`.
- Creatures are vanilla or have only these keywords: flying, trample, haste, vigilance, lifelink, deathtouch, first strike.
- Spells were picked because their real Oracle text matches what the engine does: Lightning Bolt/Strike, Searing Spear, Murder, Eviscerate, Blood Tithe, Divination, Concentrate, Tidings, Harmonize, Sacred Nectar, Angel's Mercy, Giant/Titanic Growth, Brute Force, Rampant Growth, Explosive Vegetation, Glorious/Gaea's Anthem.
- Mana: Arcane Signet, Command Tower and basic lands.
- Precons (100-card singleton): Tobias Andrion (WU), Barktooth Warbeard (BR), The Lady of the Mountain (RG), Jasmine Boreal (GW).

Card images are loaded directly from Scryfall's image CDN (the `normal` and `art_crop` URIs are stored in the JSON). If an image fails to load, a text card frame is shown instead.

Card data and images are courtesy of Scryfall. Magic: The Gathering and its card images are © Wizards of the Coast. This is an unofficial fan project and is not affiliated with Wizards of the Coast.

## Code layout
- `src/engine/engine.ts` — rules engine (pure state + functions)
- `src/engine/ai.ts` — heuristic AI (lands, best affordable spells, safe attacks on weakest opponent, survival blocks)
- `src/engine/controller.ts` — game loop glue
- `src/App.tsx` — UI

## Known gaps
No stack/priority passing (spells resolve immediately; instants castable only when the game waits on you), no activated/triggered abilities beyond mana and upkeep life, no reach/menace/double strike, simplified mulligan bottom choice (auto), auto mana payment and auto discard, no politics/AI instant tricks.
