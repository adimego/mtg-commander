# Ability coverage

Generated 2026-10-31 by `npx vite-node scripts/coverage.ts --write` from Scryfall's Oracle Cards bulk data (Commander-legal cards only).

A card counts as **fully supported** only if *every* line of its rules text compiled into the engine's ability system, its mana cost parsed exactly, and it is a normal single-faced card (multi-face cards, sagas and vehicles are always `Limited`). Everything else is badged **Limited** in game; the lines that did compile still work.

| Set | Fully supported |
|---|---|
| All Commander-legal cards (32116) | **11166 (34.8%)** |
| Top 500 by EDHREC rank | **319/500 (63.8%)** |
| Creature (16391) | 5995 (36.6%) |
| Instant (3673) | 1377 (37.5%) |
| Enchantment (3603) | 812 (22.5%) |
| Artifact (3567) | 1190 (33.4%) |
| Sorcery (3393) | 1066 (31.4%) |
| Land (1109) | 636 (57.3%) |
| Planeswalker (296) | 90 (30.4%) |
| Other (48) | 0 (0.0%) |
| Battle (36) | 0 (0.0%) |

## Planeswalkers

| When | Planeswalkers fully supported | All cards | Top 500 |
|---|---|---|---|
| Oct 30 2026, before planeswalker batch 2 | 40/296 | 10577 (32.9%) | 317/500 |
| Oct 30 2026, before planeswalker batch 3 | 77/296 | 10918 (34.0%) | 319/500 |
| Now (2026-10-31) | **90/296** | 11166 (34.8%) | 319/500 |

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
| 174 | crew N |
| 66 | morph {M}{M} |
| 55 | as ~ enters, choose a creature type. |
| 55 | {M}{M}: level N |
| 51 | cumulative upkeep {M} |
| 50 | N/N |
| 45 | you may choose not to untap ~ during your untap step. |
| 44 | infect |
| 44 | {M}{M} — N/N |
| 44 | you may look at the top card of your library any time. |
| 43 | as ~ enters, choose a color. |
| 43 | enchant player |
| 40 | draw a card at the beginning of the next turn's upkeep. |
| 40 | ~ enters prepared. |
| 40 | start your engines! |
| 40 | morph {M}{M}{M} |
| 38 | when ~ enters, you become the monarch. |
| 37 | affinity for artifacts |
| 36 | madness {M}{M} |
| 35 | bushido N |
| 35 | daybound |
| 34 | cascade |
| 34 | rebound |
| 34 | when ~ enters, you get {M}{M}. |
| 32 | bestow {M}{M} |
| 32 | toxic N |
| 32 | storm |
| 31 | station |
| 31 | suspend N—{M}{M} |
| 31 | at the beginning of each upkeep, if no spells were cast last turn, transform ~. |

## Top-500 cards that are still Limited

#9 Exotic Orchard, #14 Path of Ancestry, #17 Fellwar Stone, #29 Chaos Warp, #31 Myriad Landscape, #52 Arcane Denial, #58 Cyclonic Rift, #66 Toxic Deluge, #74 Deflecting Swat, #75 Urborg, Tomb of Yawgmoth, #78 Boseiju, Who Endures, #79 Esper Sentinel, #80 Yavimaya, Cradle of Growth, #83 Fierce Guardianship, #85 Chromatic Lantern, #90 Otawara, Soaring City, #94 City of Brass, #96 The One Ring, #100 Vandalblast, #101 Mystic Remora, #106 Deadly Rollick, #107 Jeska's Will, #109 Teferi's Protection, #110 Propaganda, #111 Cavern of Souls, #115 Urza's Saga, #119 Mana Drain, #128 Black Market Connections, #130 Victimize, #133 Roaming Throne, #138 War Room, #146 Ponder, #147 Delighted Halfling, #152 Herald's Horn, #156 Chrome Mox, #159 Ghostly Prison, #161 Windfall, #162 Reflecting Pool, #163 Nykthos, Shrine to Nyx, #166 Sink into Stupor // Soporific Springs, #167 Flawless Maneuver, #175 Mystic Sanctuary, #179 Three Tree City, #180 Gemstone Caverns, #183 Command Beacon, #185 Akroma's Will, #186 Hardened Scales, #187 Doubling Season, #189 Tireless Provisioner, #191 Idol of Oblivion, #196 Storm-Kiln Artist, #198 Fell the Profane // Fell Mire, #199 Mosswort Bridge, #200 Patchwork Banner, #203 Mox Amber, #205 Force of Will, #206 Professional Face-Breaker, #218 Wild Growth, #221 Secluded Courtyard, #222 Animate Dead, #225 Rhythm of the Wild, #229 The Great Henge, #231 Sensei's Divining Top, #232 Mirkwood Bats, #234 Malakir Rebirth // Malakir Mire, #240 Rishkar's Expertise, #242 Scute Swarm, #245 Takenuma, Abandoned Mire, #247 Mox Diamond, #248 Unclaimed Territory, #249 Bloom Tender, #251 Everflowing Chalice, #252 Archmage Emeritus, #255 Grand Abolisher, #261 Sylvan Library, #262 Academy Manufactor, #265 Untimely Malfunction, #266 Syr Konrad, the Grim, #267 Orcish Bowmasters, #272 Panharmonicon, #274 Force of Negation, #278 Bolas's Citadel, #279 Rugged Prairie, #282 Etali, Primal Storm, #283 Ragavan, Nimble Pilferer, #285 Reality Shift, #287 Seedborn Muse, #288 Faerie Mastermind, #289 Witch Enchanter // Witch-Blessed Meadow, #291 Cascade Bluffs, #293 Choked Estuary, #295 Craterhoof Behemoth, #298 Braids, Arisen Nightmare, #299 Finale of Devastation, #302 Flooded Grove, #303 The Ozolith, #304 Authority of the Consuls, #305 Shadowspear, #310 Flusterstorm, #311 Urza's Incubator, #313 Phyrexian Metamorph, #314 Dryad of the Ilysian Grove, #316 Fetid Heath, #317 Foreboding Ruins, #318 Bala Ged Recovery // Bala Ged Sanctuary, #322 Entomb, #323 Rakdos Charm, #324 Guardian Project, #331 Azusa, Lost but Seeking, #332 Whispersilk Cloak, #333 Frostboil Snarl, #336 Port Town, #340 Kindred Discovery, #341 Loran of the Third Path, #342 Sevinne's Reclamation, #343 Fortified Village, #344 Furycalm Snarl, #345 Anger, #349 Damn, #350 Utopia Sprawl, #353 Buried Alive, #356 Twilight Mire, #358 Dawn's Truce, #361 Goldspan Dragon, #362 Shifting Woodland, #363 Anointed Procession, #364 Aetherflux Reservoir, #371 Mistrise Village, #372 Arena of Glory, #373 Spark Double, #374 Pact of Negation, #376 Eiganjo, Seat of the Empire, #377 Branching Evolution, #384 Vanquisher's Banner, #388 Underworld Breach, #389 Forgotten Ancient, #393 Helm of the Host, #394 Demolition Field, #395 Dauthi Voidwalker, #396 Kutzil, Malamet Exemplar, #397 Silence, #398 Game Trail, #404 Kami of Whispered Hopes, #405 Fanatic of Rhonas, #406 Selvala, Heart of the Wilds, #407 Parallel Lives, #408 Lotho, Corrupt Shirriff, #409 Guttersnipe, #415 Mystic Forge, #417 Minas Tirith, #418 Demand Answers, #422 Shineshadow Snarl, #423 Cursed Mirror, #427 Enduring Vitality, #429 Ephemerate, #432 Mondrak, Glory Dominus, #436 Unnatural Growth, #438 Simian Spirit Guide, #440 Cabal Ritual, #443 Sram, Senior Edificer, #445 Bident of Thassa, #450 Living Death, #455 Disciple of Freyalise // Garden of Freyalise, #456 Ghalta, Primal Hunger, #459 Thassa's Oracle, #461 Entish Restoration, #466 Plaza of Heroes, #472 Chandra's Ignition, #474 Commander's Plate, #475 Mental Misstep, #481 Pyroblast, #489 Faeburrow Elder, #490 Voice of Victory, #491 Adeline, Resplendent Cathar, #493 Maskwood Nexus, #496 Field of the Dead, #497 Blasphemous Edict, #498 Ramunap Excavator, #502 Birgi, God of Storytelling // Harnfel, Horn of Bounty, #504 Mother of Runes, #505 Blind Obedience
