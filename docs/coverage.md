# Ability coverage

Generated 2026-10-31 by `npx vite-node scripts/coverage.ts --write` from Scryfall's Oracle Cards bulk data (Commander-legal cards only).

A card counts as **fully supported** only if *every* line of its rules text compiled into the engine's ability system, its mana cost parsed exactly, and the engine models its card layout: normal cards (including Vehicles and Sagas), Adventures, prepare cards, and transforming or modal double-faced cards, where every face must compile. Split, flip, meld and other multi-face layouts are always `Limited`. Everything else is badged **Limited** in game; the lines that did compile still work.

| Set | Fully supported |
|---|---|
| All Commander-legal cards (32116) | **11905 (37.1%)** |
| Top 500 by EDHREC rank | **331/500 (66.2%)** |
| Creature (16391) | 6419 (39.2%) |
| Instant (3673) | 1417 (38.6%) |
| Enchantment (3603) | 880 (24.4%) |
| Artifact (3567) | 1317 (36.9%) |
| Sorcery (3393) | 1113 (32.8%) |
| Land (1109) | 668 (60.2%) |
| Planeswalker (296) | 91 (30.7%) |
| Other (48) | 0 (0.0%) |
| Battle (36) | 0 (0.0%) |

## Planeswalkers

| When | Planeswalkers fully supported | All cards | Top 500 |
|---|---|---|---|
| Oct 30 2026, before planeswalker batch 2 | 40/296 | 10577 (32.9%) | 317/500 |
| Oct 30 2026, before planeswalker batch 3 | 77/296 | 10918 (34.0%) | 319/500 |
| Now (2026-10-31) | **91/296** | 11905 (37.1%) | 331/500 |

The 20 most popular planeswalkers (EDHREC rank):

| # | Planeswalker | Status | What is still missing |
|---|---|---|---|
| 641 | Elspeth, Storm Slayer | Full |  |
| 770 | Liliana, Dreadhorde General | Full |  |
| 772 | Elspeth, Sun's Champion | Full |  |
| 986 | Narset, Parter of Veils | Full |  |
| 1081 | Jace, Wielder of Mysteries | Full |  |
| 1098 | Ugin, the Ineffable | Full |  |
| 1130 | Teferi, Time Raveler | Full |  |
| 1147 | Tezzeret, Cruel Captain | Full |  |
| 1251 | Vraska, Betrayal's Sting | Full |  |
| 1434 | Chandra, Torch of Defiance | Full |  |
| 1575 | Ugin, the Spirit Dragon | Full |  |
| 1667 | Ugin, Eye of the Storms | Full |  |
| 1682 | Nissa, Who Shakes the World | Full |  |
| 1779 | Tezzeret the Seeker | Full |  |
| 1803 | The Eternal Wanderer | Full |  |
| 2047 | Daretti, Scrap Savant | Full |  |
| 2052 | Grist, the Hunger Tide | Full |  |
| 2082 | Liliana, Death's Majesty | Full |  |
| 2086 | Garruk, Primal Hunter | Full |  |
| 2087 | Oko, Thief of Crowns | Full |  |

## Most common unsupported rules lines

| Cards | Line (numbers → N, mana → {M}) |
|---|---|
| 66 | morph {M}{M} |
| 55 | as ~ enters, choose a creature type. |
| 51 | cumulative upkeep {M} |
| 45 | you may choose not to untap ~ during your untap step. |
| 44 | infect |
| 44 | {M}{M} — N/N |
| 44 | you may look at the top card of your library any time. |
| 43 | as ~ enters, choose a color. |
| 43 | enchant player |
| 40 | draw a card at the beginning of the next turn's upkeep. |
| 40 | morph {M}{M}{M} |
| 38 | when ~ enters, you become the monarch. |
| 37 | affinity for artifacts |
| 36 | madness {M}{M} |
| 35 | bushido N |
| 35 | daybound |
| 35 | back face: nightbound |
| 34 | cascade |
| 34 | rebound |
| 34 | when ~ enters, you get {M}{M}. |
| 32 | bestow {M}{M} |
| 32 | toxic N |
| 32 | at the beginning of each upkeep, if no spells were cast last turn, transform ~. |
| 32 | back face: at the beginning of each upkeep, if a player cast two or more spells last turn, transform ~. |
| 32 | storm |
| 31 | suspend N—{M}{M} |
| 29 | plot {M}{M} |
| 29 | unearth {M}{M} |
| 28 | ~ can block only creatures with flying. |
| 27 | flanking |

## Top-500 cards that are still Limited

#9 Exotic Orchard, #14 Path of Ancestry, #17 Fellwar Stone, #29 Chaos Warp, #31 Myriad Landscape, #52 Arcane Denial, #58 Cyclonic Rift, #66 Toxic Deluge, #74 Deflecting Swat, #75 Urborg, Tomb of Yawgmoth, #78 Boseiju, Who Endures, #79 Esper Sentinel, #80 Yavimaya, Cradle of Growth, #85 Chromatic Lantern, #90 Otawara, Soaring City, #94 City of Brass, #96 The One Ring, #100 Vandalblast, #101 Mystic Remora, #107 Jeska's Will, #109 Teferi's Protection, #110 Propaganda, #111 Cavern of Souls, #115 Urza's Saga, #119 Mana Drain, #128 Black Market Connections, #130 Victimize, #133 Roaming Throne, #138 War Room, #146 Ponder, #147 Delighted Halfling, #152 Herald's Horn, #156 Chrome Mox, #159 Ghostly Prison, #161 Windfall, #162 Reflecting Pool, #163 Nykthos, Shrine to Nyx, #166 Sink into Stupor // Soporific Springs, #175 Mystic Sanctuary, #179 Three Tree City, #180 Gemstone Caverns, #185 Akroma's Will, #186 Hardened Scales, #187 Doubling Season, #189 Tireless Provisioner, #191 Idol of Oblivion, #199 Mosswort Bridge, #200 Patchwork Banner, #203 Mox Amber, #205 Force of Will, #218 Wild Growth, #221 Secluded Courtyard, #222 Animate Dead, #225 Rhythm of the Wild, #229 The Great Henge, #231 Sensei's Divining Top, #232 Mirkwood Bats, #234 Malakir Rebirth // Malakir Mire, #240 Rishkar's Expertise, #242 Scute Swarm, #245 Takenuma, Abandoned Mire, #247 Mox Diamond, #248 Unclaimed Territory, #249 Bloom Tender, #251 Everflowing Chalice, #255 Grand Abolisher, #261 Sylvan Library, #262 Academy Manufactor, #265 Untimely Malfunction, #266 Syr Konrad, the Grim, #267 Orcish Bowmasters, #272 Panharmonicon, #274 Force of Negation, #278 Bolas's Citadel, #279 Rugged Prairie, #282 Etali, Primal Storm, #283 Ragavan, Nimble Pilferer, #285 Reality Shift, #287 Seedborn Muse, #288 Faerie Mastermind, #291 Cascade Bluffs, #293 Choked Estuary, #295 Craterhoof Behemoth, #298 Braids, Arisen Nightmare, #299 Finale of Devastation, #302 Flooded Grove, #303 The Ozolith, #304 Authority of the Consuls, #305 Shadowspear, #310 Flusterstorm, #311 Urza's Incubator, #313 Phyrexian Metamorph, #314 Dryad of the Ilysian Grove, #316 Fetid Heath, #317 Foreboding Ruins, #322 Entomb, #323 Rakdos Charm, #324 Guardian Project, #331 Azusa, Lost but Seeking, #332 Whispersilk Cloak, #333 Frostboil Snarl, #336 Port Town, #340 Kindred Discovery, #341 Loran of the Third Path, #342 Sevinne's Reclamation, #343 Fortified Village, #344 Furycalm Snarl, #345 Anger, #349 Damn, #350 Utopia Sprawl, #353 Buried Alive, #356 Twilight Mire, #358 Dawn's Truce, #361 Goldspan Dragon, #362 Shifting Woodland, #363 Anointed Procession, #364 Aetherflux Reservoir, #371 Mistrise Village, #372 Arena of Glory, #373 Spark Double, #374 Pact of Negation, #376 Eiganjo, Seat of the Empire, #377 Branching Evolution, #384 Vanquisher's Banner, #388 Underworld Breach, #389 Forgotten Ancient, #393 Helm of the Host, #394 Demolition Field, #395 Dauthi Voidwalker, #396 Kutzil, Malamet Exemplar, #397 Silence, #398 Game Trail, #404 Kami of Whispered Hopes, #405 Fanatic of Rhonas, #406 Selvala, Heart of the Wilds, #407 Parallel Lives, #408 Lotho, Corrupt Shirriff, #415 Mystic Forge, #417 Minas Tirith, #418 Demand Answers, #422 Shineshadow Snarl, #423 Cursed Mirror, #427 Enduring Vitality, #429 Ephemerate, #432 Mondrak, Glory Dominus, #436 Unnatural Growth, #438 Simian Spirit Guide, #440 Cabal Ritual, #443 Sram, Senior Edificer, #445 Bident of Thassa, #450 Living Death, #456 Ghalta, Primal Hunger, #459 Thassa's Oracle, #461 Entish Restoration, #466 Plaza of Heroes, #472 Chandra's Ignition, #474 Commander's Plate, #475 Mental Misstep, #481 Pyroblast, #489 Faeburrow Elder, #490 Voice of Victory, #491 Adeline, Resplendent Cathar, #493 Maskwood Nexus, #496 Field of the Dead, #497 Blasphemous Edict, #498 Ramunap Excavator, #502 Birgi, God of Storytelling // Harnfel, Horn of Bounty, #504 Mother of Runes, #505 Blind Obedience

## By set (first printing, newest first)

Cards are grouped by the set that first printed them (Scryfall `not:reprint`), Commander-legal only. Generated by `npx vite-node scripts/sets.ts`.

| Set | Released | Type | Cards | Before (Oct 31 2026) | Now | Top failing clauses |
|---|---|---|---|---|---|---|
| Mystery Booster Commander Edition (MBC) | 2026-10-19 | draft_innovation | 0 | 0 (-) | **0 (-)** |  |
| Reality Fracture Commander (FRC) | 2026-10-02 | commander | 18 | 5 (28%) | **5 (28%)** | 2× when ~ enters, you become the monarch.<br>1× when ~ enters, reveal cards from the top of your library until you reveal x creature cards<br>1× you can't lose the game and your opponents can't win the game. |
| Reality Fracture (FRA) | 2026-10-02 | expansion | 268 | 118 (44%) | **119 (44%)** | 2× {M}{M}: return ~ from your graveyard to the battlefield with a finality counter on it. act<br>1× whenever you gain life, put a loyalty counter on ajani.<br>1× whenever you activate a loyalty ability, create a N/N colorless wizard soldier creature to |
| The Hobbit (HOB) | 2026-08-14 | expansion | 186 | 57 (31%) | **71 (38%)** | 1× whenever a creature card leaves your graveyard, amass goblins N.<br>1× as ~ enters, choose a creature type.<br>1× creatures you control of the chosen type get +N/+N. |
| Marvel Super Heroes (MSH) | 2026-06-26 | expansion | 270 | 72 (27%) | **80 (30%)** | 5× {M}: add {M} or {M}. activate only if ~ entered this turn or if you control a basic land.<br>2× when ~ enters, it connives.<br>2× improvise |
| Marvel Super Heroes Commander (MSC) | 2026-06-26 | commander | 385 | 125 (32%) | **132 (34%)** | 4× rebound<br>3× at the beginning of combat on your turn, if you've cast a noncreature spell this turn, cre<br>2× ~ costs {M} less to cast if it targets a tapped creature. |
| Secrets of Strixhaven (SOS) | 2026-04-24 | expansion | 255 | 95 (37%) | **109 (43%)** | 5× paradigm<br>4× repartee — whenever you cast an instant or sorcery spell that targets a creature, put a +N<br>3× converge — ~ enters with a +N/+N counter on it for each color of mana spent to cast it. |
| Secrets of Strixhaven Commander (SOC) | 2026-04-24 | commander | 60 | 12 (20%) | **12 (20%)** | 1× exile the top four cards of your library in a face-down pile, then exile the top four card<br>1× at the beginning of your first main phase, mill a card, then exile a card from your gravey<br>1× whenever one or more cards leave your graveyard, ~ deals N damage to each opponent. |
| Teenage Mutant Ninja Turtles (TMT) | 2026-03-06 | expansion | 187 | 71 (38%) | **93 (50%)** | 4× when ~ enters, create a mutagen token.<br>1× at the beginning of your end step, draw a card for each card type among spells you've cast<br>1× whenever ~ attack or block, sacrifice a permanent unless you discard a card. |
| Lorwyn Eclipsed Commander (ECC) | 2026-01-23 | commander | 24 | 2 (8%) | **3 (13%)** | 5× encore {M}{M}{M}<br>1× put one, two, or three target creature cards from graveyards onto the battlefield under yo<br>1× {M}: add one mana of any color. spend this mana only to cast a creature spell. |
| Lorwyn Eclipsed (ECL) | 2026-01-23 | expansion | 252 | 76 (30%) | **82 (33%)** | 7× back face: at the beginning of your first main phase, you may pay {M}. if you do, transfor<br>6× at the beginning of your first main phase, you may pay {M}. if you do, transform ~.<br>4× as an additional cost to cast ~, you may blight N. |
| Avatar: The Last Airbender (TLA) | 2025-11-21 | expansion | 277 | 96 (35%) | **111 (40%)** | 3× as an additional cost to cast ~, waterbend {M}.<br>3× as an additional cost to cast ~, you may waterbend {M}.<br>2× when ~ enters, airbend up to one target creature. |
| Marvel's Spider-Man (SPM) | 2025-09-26 | expansion | 187 | 65 (35%) | **73 (39%)** | 1× enchanted creature gets +N/+N, has menace, and is a symbiote in addition to its other type<br>1× you may cast ~ from your graveyard by discarding a card in addition to paying its other co<br>1× choose one or both — • counter target spell. • tap one or two target creatures. |
| Edge of Eternities Commander (EOC) | 2025-08-01 | commander | 24 | 6 (25%) | **7 (29%)** | 1× ~ enters tapped with six stun counters on it.<br>1× when ~ enters, any number of target noncreature artifacts you control become N/N artifact <br>1× each artifact creature you control has melee, trample, and haste. |
| Edge of Eternities (EOE) | 2025-08-01 | expansion | 252 | 117 (46%) | **118 (47%)** | 2× void — if a nonland permanent left the battlefield this turn or a spell was warped this tu<br>1× N+ \| {M}{M}, {M}: create a token that's a copy of target artifact or enchantment you contr<br>1× {M}, {M}, sacrifice ~: draw x cards, where x is the number of differently named lands you  |
| Final Fantasy Commander (FIC) | 2025-06-13 | commander | 124 | 7 (6%) | **7 (6%)** | 1× dualcast — the second spell you cast each turn costs {M} less to cast.<br>1× eukrasia — whenever you cast your second spell each turn, draw a card.<br>1× no mercy — whenever ~ deals combat damage to an opponent, it deals that much damage to eac |
| Final Fantasy (FIN) | 2025-06-13 | expansion | 304 | 96 (32%) | **104 (34%)** | 4× {M}{M}{M}, {M}: exile ~, then return it to the battlefield transformed under its owner's c<br>3× whenever you cast a noncreature spell, if at least four mana was spent to cast it, put a +<br>2× equipped creature gets +N/+N and is a knight in addition to its other types. |
| Tarkir: Dragonstorm Commander (TDC) | 2025-04-11 | commander | 50 | 4 (8%) | **7 (14%)** | 2× choose one. if you control a commander as you cast ~, you may choose both instead. • creat<br>1× whenever you cast an instant or sorcery spell, if ~ has fewer than three charge counters o<br>1× remove three charge counters from ~: when you next cast an instant or sorcery spell this t |
| Tarkir: Dragonstorm (TDM) | 2025-04-11 | expansion | 252 | 89 (35%) | **110 (44%)** | 3× as an additional cost to cast ~, you may behold a dragon.<br>2× when ~ enters, exile up to two target cards from a single graveyard.<br>2× ~ costs {M} less to cast if you've cast another spell this turn. |
| Aetherdrift (DFT) | 2025-02-14 | expansion | 256 | 124 (48%) | **124 (48%)** | 5× {M}{M}, {M}, sacrifice ~: create a N/N colorless pilot creature token with "~ saddles moun<br>3× ~ saddles mounts and crews vehicles as though its power were N greater.<br>3× affinity for artifacts |
